# =============================================================================
# HUSID match check: how many students in the OfS data have a student ID?
#
# Joins the OfS individualised file to the "ownstu HUSID extract", which links
# HUSID to the student record ID (SPRIDEN_ID). Reports the share of students
# that can be matched:
#   - overall, and within the APP population used for the equity gap analyses
#   - by academic year, level, mode, faculty and lifecycle stage
#   - separately for students matched on HUSID and on SID (from 2022-23 the
#     OfS file holds the identifier in 'sid' and leaves 'husid' empty)
# so you can judge whether other student-record data (for example religion)
# can be brought into the APP analyses by SPRIDEN_ID.
#
# Counts are of unique students (HUSID, or SID where there is no HUSID), not rows: the OfS file has one row per
# student per subject, and a student can appear in several years.
#
# Outputs (outputs/husid_match):
#   husid_match_summary.csv      match rates for every breakdown
#   husid_match_by_id_year.csv   APP students and extract IDs by year the ID was issued
#   husid_match_by_provider_part.csv  most common provider codes within the IDs
#   husid_near_matches.csv       unmatched APP students with a near match in the extract
#   husid_extract_ids_in_ofs.csv extract IDs found anywhere in the OfS file
#   husid_id_lengths.csv         number of digits in the IDs in each file
#   husid_unmatched_sample.csv   up to 200 unmatched HUSIDs or SIDs to investigate
#                                (personal identifiers: keep this file secure)
# =============================================================================

library(readxl)
library(dplyr)
library(tidyr)
library(readr)
library(purrr)

data_dir  <- "C:/Users/David278/OneDrive - Middlesex University/APP Framework/Data/Indivisualised data for regression"
ofs_file  <- file.path(data_dir, "IND_2026_1_Core_10004351 - Tableau.xlsx")
rds_file  <- file.path(data_dir, "IND_2026_1_Core_10004351.rds")
out_dir   <- file.path(data_dir, "outputs", "husid_match")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
mdx_ukprn <- 10004351

# ---- 1. The HUSID extract ------------------------------------------------------
# Finds "ownstu HUSID extract" whatever its extension (.csv or .xlsx).
extract_file <- list.files(data_dir, pattern = "^ownstu HUSID extract\\.(csv|xlsx|xls)$",
                           full.names = TRUE, ignore.case = TRUE)[1]
if (is.na(extract_file)) stop("Could not find 'ownstu HUSID extract' in ", data_dir)

# Read every column as text. Reading HUSIDs as numbers can drop leading zeros
# or turn them into scientific notation, and then nothing matches.
extract <- if (grepl("\\.csv$", extract_file, ignore.case = TRUE)) {
  read_csv(extract_file, col_types = cols(.default = col_character()))
} else {
  read_excel(extract_file, col_types = "text")
}
names(extract) <- toupper(trimws(names(extract)))
if (!all(c("SPRIDEN_ID", "HUSID") %in% names(extract)))
  stop("The extract needs columns SPRIDEN_ID and HUSID. Found: ", paste(names(extract), collapse = ", "))

# HUSIDs are 13 digits. Strip anything that is not a digit and restore any
# leading zeros lost in Excel, so both files use the same form.
clean_husid <- function(x) {
  x <- as.character(x)
  x <- ifelse(grepl("[eE]\\+", x), format(suppressWarnings(as.numeric(x)), scientific = FALSE, trim = TRUE), x)
  x <- gsub("\\.0+$", "", x)
  x <- gsub("[^0-9]", "", x)
  x <- ifelse(nchar(x) > 0 & nchar(x) < 13, paste0(strrep("0", pmax(0, 13 - nchar(x))), x), x)
  ifelse(nchar(x) == 0, NA_character_, x)
}

# HUSIDs saved in scientific notation (e.g. 1.23457E+12) have already lost
# digits in Excel and cannot be recovered. If this count is above zero,
# re-export the extract with the HUSID column formatted as text.
n_sci <- sum(grepl("[eE]\\+", extract$HUSID))
if (n_sci > 0) warning(n_sci, " HUSIDs are in scientific notation and will probably not match. Re-export with HUSID as text.")

extract <- extract %>%
  mutate(husid_clean = clean_husid(HUSID), SPRIDEN_ID = na_if(trimws(SPRIDEN_ID), ""))

cat("\n---- HUSID extract ----\n")
cat("Rows:", nrow(extract), "\n")
cat("Rows with no HUSID:", sum(is.na(extract$husid_clean)), "\n")
cat("Rows with no student ID (SPRIDEN_ID):", sum(is.na(extract$SPRIDEN_ID)), "\n")
cat("Rows with neither:", sum(is.na(extract$husid_clean) & is.na(extract$SPRIDEN_ID)), "\n")
cat("HUSIDs that are not 13 digits:", sum(!is.na(extract$husid_clean) & nchar(extract$husid_clean) != 13), "\n")
dup_husid <- extract %>% filter(!is.na(husid_clean)) %>% count(husid_clean) %>% filter(n > 1)
cat("HUSIDs linked to more than one student ID:", nrow(dup_husid), "\n")
dup_id <- extract %>% filter(!is.na(husid_clean), !is.na(SPRIDEN_ID)) %>% distinct(SPRIDEN_ID, husid_clean) %>% count(SPRIDEN_ID) %>% filter(n > 1)
cat("Student IDs linked to more than one HUSID:", nrow(dup_id), "\n")

# One row per HUSID for matching. Rows with no student ID are dropped, since
# they cannot link to anything. (If a HUSID has several IDs, keep the first
# and flag it, so the match rate is not inflated by duplicates)
lookup <- extract %>%
  filter(!is.na(husid_clean), !is.na(SPRIDEN_ID)) %>%
  group_by(husid_clean) %>%
  summarise(SPRIDEN_ID = first(SPRIDEN_ID), ids_for_husid = n_distinct(SPRIDEN_ID), .groups = "drop")

# ---- 2. The OfS individualised data ---------------------------------------------
clean_names <- function(df) {
  nm <- tolower(names(df)); nm <- gsub("[^a-z0-9]+", "_", nm); nm <- gsub("^_|_$", "", nm)
  names(df) <- nm; df
}
if (exists("raw") && is.data.frame(raw) && "husid" %in% names(raw)) {
  message("Using 'raw' already in memory")
  ofs <- raw
} else if (file.exists(rds_file)) {
  ofs <- readRDS(rds_file)
} else {
  ofs <- read_excel(ofs_file, sheet = 1, guess_max = 1100000) %>% clean_names()
}

# The four academic faculties, named as they appear in facultyv4. Partner,
# collaborative and unassigned records are left out of the faculty breakdown.
academic_faculties <- c("Arts and Creative Industries", "Business and Law",
                        "Health,Social Care & Education", "Science and Technology")

# From 2022-23 (Data Futures) the OfS file holds the student identifier in
# 'sid' and leaves 'husid' empty. For students who started before then, the
# SID should be the same number as their HUSID. Each student is matched on
# HUSID where there is one, and on SID otherwise.
if (!"sid" %in% names(ofs)) ofs$sid <- NA_character_

ofs <- ofs %>%
  mutate(husid_clean = clean_husid(husid),
         sid_clean = clean_husid(sid),
         id_source = case_when(!is.na(husid_clean) ~ "HUSID",
                               !is.na(sid_clean)   ~ "SID",
                               TRUE                ~ "None"),
         match_key = coalesce(husid_clean, sid_clean),
         registering_ukprn = suppressWarnings(as.numeric(registering_ukprn)),
         app_exclusion_reason = suppressWarnings(as.numeric(app_exclusion_reason)),
         base_academic_year = suppressWarnings(as.numeric(base_academic_year)),
         faculty = coalesce(as.character(facultyv4), "Unknown"),
         in_app_population = registering_ukprn == mdx_ukprn & app_exclusion_reason == 0 &
           as.character(linked_engagement_starting_mode) == "FT" &
           as.character(level_aggregate_1) == "DEG")

cat("\n---- OfS individualised data ----\n")
cat("Rows:", nrow(ofs), "\n")
cat("Rows with a HUSID:", sum(ofs$id_source == "HUSID"), "\n")
cat("Rows with no HUSID but a SID:", sum(ofs$id_source == "SID"), "\n")
cat("Rows with neither (often students returned through the ILR):", sum(ofs$id_source == "None"), "\n")
cat("SIDs that are not 13 digits:", sum(!is.na(ofs$sid_clean) & nchar(ofs$sid_clean) != 13), "\n")

ofs <- ofs %>% left_join(lookup, by = c("match_key" = "husid_clean")) %>%
  mutate(matched = !is.na(SPRIDEN_ID))

# ---- 2b. Second pass on the first 13 digits ----------------------------------------
# HESA identifiers are 13 digits. For many IDs issued from 2022, one file holds
# extra trailing digits, so the IDs agree on the first 13 digits but not in full.
# Where the exact ID is not found, students are matched on the first 13 digits.
# This only happens where the 13-digit key has no more than one longer version
# in each file, and one student ID in the extract, so nobody can be linked to
# another student's record. (A 13-digit ID and one longer version of it are
# treated as the same student.) 'matched' stays as the exact match; 'matched_13'
# includes both passes, and 'student_id' holds the SPRIDEN_ID from either.
key13 <- function(x) ifelse(!is.na(x) & nchar(x) > 13, substr(x, 1, 13), x)

lookup13 <- extract %>%
  filter(!is.na(husid_clean), !is.na(SPRIDEN_ID)) %>%
  mutate(key = key13(husid_clean)) %>%
  group_by(key) %>%
  filter(n_distinct(husid_clean[husid_clean != key]) <= 1, n_distinct(SPRIDEN_ID) == 1) %>%
  summarise(SPRIDEN_ID_13 = first(SPRIDEN_ID), .groups = "drop")

ofs_key_unique <- ofs %>%
  filter(!is.na(match_key)) %>%
  mutate(key = key13(match_key)) %>%
  group_by(key) %>%
  summarise(key_unique = n_distinct(match_key[match_key != key]) <= 1, .groups = "drop")

ofs <- ofs %>%
  mutate(key13 = key13(match_key)) %>%
  left_join(ofs_key_unique, by = c("key13" = "key")) %>%
  left_join(lookup13, by = c("key13" = "key")) %>%
  mutate(SPRIDEN_ID_13 = ifelse(coalesce(key_unique, FALSE), SPRIDEN_ID_13, NA_character_),
         matched_13 = matched | !is.na(SPRIDEN_ID_13),
         student_id = coalesce(SPRIDEN_ID, SPRIDEN_ID_13)) %>%
  select(-key_unique)

cat("\n---- Second pass on the first 13 digits ----\n")
cat("Extra rows matched:", sum(ofs$matched_13 & !ofs$matched), "\n")
cat("13-digit keys left out because more than one longer ID shares them:",
    sum(!ofs_key_unique$key_unique), "in the OfS file,",
    n_distinct(key13(lookup$husid_clean)) - nrow(lookup13), "in the extract\n")

# ---- 3. Match rates ------------------------------------------------------------------
# Unique students: a student counts as matched if their HUSID (or SID, where
# there is no HUSID) is in the extract. Students with neither cannot be matched
# this way and are counted as unmatched. A student with a HUSID in one year
# and only a SID in a later year counts once in 'students' but appears in both
# the HUSID and SID columns, so those columns can add up to more than the total.
rate <- function(d, label, ...) {
  d %>%
    mutate(student = coalesce(match_key, paste0("noid_", row_number()))) %>%
    group_by(...) %>%
    summarise(students = n_distinct(student),
              students_matched = n_distinct(student[matched]),
              students_matched_inc_13 = n_distinct(student[matched_13]),
              with_husid = n_distinct(student[id_source == "HUSID"]),
              matched_via_husid = n_distinct(student[matched & id_source == "HUSID"]),
              with_sid_only = n_distinct(student[id_source == "SID"]),
              matched_via_sid = n_distinct(student[matched & id_source == "SID"]),
              no_identifier = n_distinct(student[id_source == "None"]),
              .groups = "drop") %>%
    mutate(match_rate_pct = round(100 * students_matched / students, 1),
           match_rate_inc_13_pct = round(100 * students_matched_inc_13 / students, 1),
           husid_match_rate_pct = round(100 * matched_via_husid / with_husid, 1),
           sid_match_rate_pct = round(100 * matched_via_sid / with_sid_only, 1),
           across(ends_with("_pct"), ~ ifelse(is.nan(.x), NA_real_, .x)),
           breakdown = label, .before = 1)
}

app <- ofs %>% filter(in_app_population)
stage_rows <- bind_rows(
  app %>% filter(as.numeric(entrant_exclusion) == 0) %>% mutate(stage = "Continuation and completion entrants"),
  app %>% filter(as.numeric(in_degree_outcomes_population) == 1) %>% mutate(stage = "Attainment (qualifiers)"),
  app %>% filter(as.numeric(in_progression_population) == 1) %>% mutate(stage = "Progression (Graduate Outcomes)")
)

summary_tbl <- bind_rows(
  rate(ofs, "All students in the OfS file") %>% mutate(group = "All"),
  rate(app, "APP population (full-time first degree, UK, registered)") %>% mutate(group = "All"),
  rate(app, "APP population by year", base_academic_year) %>% mutate(group = as.character(base_academic_year)) %>% select(-base_academic_year),
  rate(app %>% filter(faculty %in% academic_faculties), "APP population by faculty (academic faculties)", faculty) %>% rename(group = faculty),
  rate(stage_rows, "APP population by lifecycle stage", stage) %>% rename(group = stage),
  rate(ofs, "All students by level", level_aggregate_1) %>% mutate(group = as.character(level_aggregate_1)) %>% select(-level_aggregate_1),
  rate(ofs, "All students by mode", linked_engagement_starting_mode) %>% mutate(group = as.character(linked_engagement_starting_mode)) %>% select(-linked_engagement_starting_mode)
) %>%
  select(breakdown, group, students, students_matched, match_rate_pct,
         students_matched_inc_13, match_rate_inc_13_pct,
         with_husid, matched_via_husid, husid_match_rate_pct,
         with_sid_only, matched_via_sid, sid_match_rate_pct, no_identifier)

if (!any(app$faculty %in% academic_faculties))
  warning("None of the academic faculty names were found in facultyv4. Check the spelling in 'academic_faculties'.")

cat("\n---- Match rates (unique students) ----\n")
print(summary_tbl, n = Inf, width = Inf)

# Which way round: how many IDs in the extract appear in the OfS file?
in_ofs <- lookup %>% mutate(found = husid_clean %in% c(ofs$husid_clean, ofs$sid_clean))
cat("\nIDs in the extract that appear in the OfS file (as a HUSID or SID):", sum(in_ofs$found), "of", nrow(in_ofs),
    sprintf("(%.1f%%)\n", 100 * mean(in_ofs$found)))

# ---- 3b. Which identifiers are missing from the extract? ----------------------------
# HESA identifiers start with the two-digit year they were first issued (for
# example 22... for an ID issued in 2022-23). Counting IDs by that prefix in
# the extract and in the OfS file shows whether the extract simply does not
# hold IDs issued in recent years, which would explain a low match for recent
# entrants. Digits 3 to 6 identify the issuing provider, so the second table
# shows whether unmatched IDs were issued in a different form or by another
# provider. Both tables are counts only, with no identifiers.
id_parts <- function(x) tibble(id_year_prefix = substr(x, 1, 2), id_provider_part = substr(x, 3, 6))

app_ids <- app %>%
  filter(!is.na(match_key)) %>%
  group_by(match_key) %>%
  summarise(id_source = first(id_source), matched = any(matched), .groups = "drop") %>%
  bind_cols(id_parts(.$match_key))

prefix_tbl <- full_join(
  bind_cols(lookup, id_parts(lookup$husid_clean)) %>% count(id_year_prefix, name = "ids_in_extract"),
  app_ids %>% group_by(id_year_prefix) %>%
    summarise(app_students = n(),
              app_with_husid = sum(id_source == "HUSID"),
              app_with_sid_only = sum(id_source == "SID"),
              app_matched = sum(matched), .groups = "drop"),
  by = "id_year_prefix") %>%
  mutate(across(where(is.numeric), ~ coalesce(.x, 0L)),
         match_rate_pct = round(100 * app_matched / app_students, 1)) %>%
  arrange(id_year_prefix)

cat("\n---- APP students and extract IDs by year the ID was issued (first two digits) ----\n")
print(prefix_tbl, n = Inf, width = Inf)

provider_tbl <- bind_rows(
  bind_cols(lookup, id_parts(lookup$husid_clean)) %>% count(id_provider_part) %>% mutate(source = "Extract"),
  app_ids %>% filter(matched) %>% count(id_provider_part) %>% mutate(source = "APP students, matched"),
  app_ids %>% filter(!matched) %>% count(id_provider_part) %>% mutate(source = "APP students, unmatched")
) %>%
  group_by(source) %>% slice_max(n, n = 5, with_ties = FALSE) %>% ungroup() %>%
  select(source, id_provider_part, n)

cat("\n---- Most common provider part of the ID (digits 3 to 6) ----\n")
print(provider_tbl, n = Inf)

# ---- 3c. Near matches for unmatched APP students -------------------------------------
# The extract holds plenty of IDs issued from 2022, yet few of them match. This
# checks whether unmatched IDs are close to an ID in the extract, which would
# point to a formatting or allocation difference rather than missing students:
#   same_first_12     same ID apart from the last (check) digit
#   same_except_provider  same year, serial and check digit, but a different
#                     provider part (digits 3 to 6), e.g. 1000 against 1067
#   in_ofs_elsewhere  the extract ID is in the OfS file, but on another row
#                     (e.g. a HUSID matches a different student's SID)
# The table also counts, for the extract, how many of its IDs appear anywhere in
# the OfS file. Counts only, with no identifiers.
ext_ids <- lookup$husid_clean
no_provider <- function(x) paste0(substr(x, 1, 2), substr(x, 7, 13))
issued <- function(prefix) ifelse(prefix %in% sprintf("%02d", 22:30), "Issued 2022 or later", "Issued before 2022")
provider_group <- function(part) ifelse(part %in% c("1067", "1000"), part, "Other")

near_tbl <- app_ids %>%
  filter(!matched) %>%
  mutate(id_issued = issued(id_year_prefix),
         provider = provider_group(id_provider_part),
         same_first_12 = substr(match_key, 1, 12) %in% substr(ext_ids, 1, 12),
         same_except_provider = no_provider(match_key) %in% no_provider(ext_ids)) %>%
  group_by(id_issued, id_source, provider) %>%
  summarise(unmatched_app_students = n(),
            same_first_12 = sum(same_first_12),
            same_except_provider = sum(same_except_provider),
            .groups = "drop")

all_ofs_ids <- unique(na.omit(c(ofs$husid_clean, ofs$sid_clean)))
extract_tbl <- tibble(id = ext_ids) %>%
  bind_cols(id_parts(.$id)) %>%
  mutate(id_issued = issued(id_year_prefix), provider = provider_group(id_provider_part),
         in_ofs = id %in% all_ofs_ids, in_app = id %in% app_ids$match_key) %>%
  group_by(id_issued, provider) %>%
  summarise(ids_in_extract = n(), found_anywhere_in_ofs = sum(in_ofs),
            found_in_app_population = sum(in_app), .groups = "drop")

cat("\n---- Unmatched APP students: near matches in the extract ----\n")
print(near_tbl, n = Inf, width = Inf)
cat("\n---- Extract IDs: how many appear in the OfS file at all ----\n")
print(extract_tbl, n = Inf, width = Inf)

# How many digits does each ID have? HESA IDs should have 13. Counts only.
length_tbl <- bind_rows(
  tibble(source = "Extract", id = extract$husid_clean),
  tibble(source = "OfS husid", id = ofs$husid_clean),
  tibble(source = "OfS sid", id = ofs$sid_clean)
) %>%
  filter(!is.na(id)) %>% distinct() %>%
  mutate(id_issued = issued(substr(id, 1, 2)), digits = nchar(id)) %>%
  count(source, id_issued, digits, name = "ids")

cat("\n---- Number of digits in each ID ----\n")
print(length_tbl, n = Inf)

# ---- 4. Save ------------------------------------------------------------------------
write_csv(summary_tbl, file.path(out_dir, "husid_match_summary.csv"))
write_csv(prefix_tbl, file.path(out_dir, "husid_match_by_id_year.csv"))
write_csv(provider_tbl, file.path(out_dir, "husid_match_by_provider_part.csv"))
write_csv(near_tbl, file.path(out_dir, "husid_near_matches.csv"))
write_csv(extract_tbl, file.path(out_dir, "husid_extract_ids_in_ofs.csv"))
write_csv(length_tbl, file.path(out_dir, "husid_id_lengths.csv"))
unmatched <- app %>% filter(!matched_13, !is.na(match_key)) %>%
  distinct(match_key, id_source, base_academic_year, faculty) %>% head(200)
write_csv(unmatched, file.path(out_dir, "husid_unmatched_sample.csv"))
cat("\nFiles written to:", out_dir, "\n")

# ---- 5. Next step: bringing in another dataset by student ID ----------------------
# Once the match rate is acceptable, a dataset keyed by SPRIDEN_ID (for example
# religion) can be joined like this, then carried into the equity gap analyses:
#
#   religion <- read_csv(file.path(data_dir, "religion extract.csv"),
#                        col_types = cols(.default = col_character()))
#   ofs_with_religion <- ofs %>% left_join(religion, by = c("student_id" = "SPRIDEN_ID"))
#
# Check the same way how many matched students have a religion recorded before
# relying on it, since a high HUSID match rate does not guarantee the second
# dataset is complete.
