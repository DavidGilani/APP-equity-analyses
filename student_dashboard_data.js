// Baked-in population reference for the student-cohort comparison dashboard.
// Population = whole student population 2025/26 (14,256 students), derived from
// institutional EDI data. No personal records here: percentages and counts only.
// Replace this file to refresh the baseline. Keep it in the same folder as
// student_dashboard.html.
window.DASHBOARD_DATA = {
 "META": {
  "generated": "2026-09-04",
  "minCell": 10,
  "popTotal": 14256,
  "populationLabel": "Whole student population (2025/26)",
  "dimensions": [
   "Gender",
   "Ethnicity (broad)",
   "Ethnicity (detailed)",
   "Disability",
   "First generation in HE",
   "Age group",
   "Residency",
   "Religion",
   "Sexual orientation",
   "Care leaver status"
  ],
  // Which CSV column headers map to each dimension. Matching is case- and
  // punctuation-insensitive, so "Gender Identity" matches "gender identity".
  // Add your own header names here if your CSV uses different labels.
  "columnAliases": {
   "Gender": ["gender", "sex", "gender identity"],
   "Ethnicity (broad)": ["ethnicity", "ethnicity broad", "broad ethnicity", "ethnic group"],
   "Ethnicity (detailed)": ["ethnicity detailed", "detailed ethnicity", "ethnicity detail"],
   "Disability": ["disability", "disability status", "disabled"],
   "First generation in HE": ["first generation in he", "first generation", "first gen", "firstgen", "first in family"],
   "Age group": ["age group", "agegroup", "age band", "age"],
   "Residency": ["residency", "fee status", "domicile", "residence"],
   "Religion": ["religion", "religion or belief", "faith"],
   "Sexual orientation": ["sexual orientation", "orientation", "sexuality"],
   "Care leaver status": ["care leaver status", "care leaver", "care experienced", "careleaver"]
  },
  "disclosure": "Population figures are the 2025/26 whole-student-population distributions (14,256 students). Your uploaded cohort is compared against these. Groups with fewer than 10 students in your cohort are suppressed and not tested. Significance is a two-proportion z-test at the 95% level. Category labels in your CSV must match the population labels exactly to line up (see the notes under each chart)."
 },
 "POPULATION": {
  "Gender": [
   {"category": "Female", "pct": 56.1, "n": 7996},
   {"category": "Male", "pct": 43.2, "n": 6162},
   {"category": "O", "pct": 0.5, "n": 75},
   {"category": "Not known", "pct": 0.1, "n": 13},
   {"category": "Not available", "pct": 0.1, "n": 10}
  ],
  "Ethnicity (broad)": [
   {"category": "Asian", "pct": 36.1, "n": 5142},
   {"category": "Black", "pct": 21.0, "n": 2996},
   {"category": "White", "pct": 18.1, "n": 2574},
   {"category": "Not known", "pct": 8.4, "n": 1196},
   {"category": "Arab", "pct": 5.3, "n": 758},
   {"category": "Mixed", "pct": 4.3, "n": 619},
   {"category": "Chinese", "pct": 3.1, "n": 442},
   {"category": "Other/Not Known", "pct": 2.2, "n": 316},
   {"category": "Not Known", "pct": 1.5, "n": 211}
  ],
  "Ethnicity (detailed)": [
   {"category": "Asian-Indian", "pct": 20.3, "n": 2900},
   {"category": "Black-African", "pct": 18.1, "n": 2583},
   {"category": "White", "pct": 10.4, "n": 1476},
   {"category": "Other Asian Background", "pct": 7.4, "n": 1054},
   {"category": "White-British", "pct": 7.1, "n": 1016},
   {"category": "Arab", "pct": 5.7, "n": 810},
   {"category": "Asian-Pakistani", "pct": 5.1, "n": 727},
   {"category": "Asian-Bangladeshi", "pct": 4.4, "n": 632},
   {"category": "Other White Background", "pct": 3.6, "n": 508},
   {"category": "Black-Caribbean", "pct": 3.3, "n": 470},
   {"category": "Chinese", "pct": 3.1, "n": 449},
   {"category": "Other Ethnic Background", "pct": 2.4, "n": 336},
   {"category": "Other Mixed Background", "pct": 2.1, "n": 304},
   {"category": "Other Black Background", "pct": 1.2, "n": 178},
   {"category": "Mixed-White/Black Caribbean", "pct": 1.2, "n": 169},
   {"category": "Mixed-White/Black African", "pct": 1.0, "n": 141},
   {"category": "Refused to answer", "pct": 0.8, "n": 113},
   {"category": "Not Given", "pct": 0.7, "n": 103},
   {"category": "Mixed-White/Asian", "pct": 0.7, "n": 96},
   {"category": "White-Irish", "pct": 0.5, "n": 73},
   {"category": "Not known", "pct": 0.3, "n": 41},
   {"category": "Not given", "pct": 0.2, "n": 30},
   {"category": "Refused to Answer", "pct": 0.1, "n": 17}
  ],
  "Disability": [
   {"category": "N", "pct": 93.2, "n": 11028},
   {"category": "Y", "pct": 6.8, "n": 803}
  ],
  "First generation in HE": [
   {"category": "Yes", "pct": 54.0, "n": 7693},
   {"category": "No", "pct": 37.8, "n": 5384},
   {"category": "Not known", "pct": 8.3, "n": 1179}
  ],
  "Age group": [
   {"category": "16-20", "pct": 38.2, "n": 5449},
   {"category": "21-24", "pct": 23.1, "n": 3300},
   {"category": "30+", "pct": 19.4, "n": 2762},
   {"category": "25-29", "pct": 11.0, "n": 1565},
   {"category": "Not known", "pct": 8.3, "n": 1179}
  ],
  "Residency": [
   {"category": "United Kingdom", "pct": 64.5, "n": 9202},
   {"category": "Overseas", "pct": 35.1, "n": 5008},
   {"category": "EU", "pct": 0.1, "n": 11},
   {"category": "Not known", "pct": 0.1, "n": 11}
  ],
  "Religion": [
   {"category": "Christian", "pct": 27.7, "n": 3953},
   {"category": "Muslim", "pct": 24.3, "n": 3460},
   {"category": "No religion or belief", "pct": 14.1, "n": 2012},
   {"category": "Hindu", "pct": 14.0, "n": 1990},
   {"category": "Not known", "pct": 10.8, "n": 1542},
   {"category": "I prefer not to say", "pct": 3.1, "n": 446},
   {"category": "Buddhist", "pct": 1.6, "n": 234},
   {"category": "Any other religion or belief", "pct": 1.2, "n": 170},
   {"category": "Spiritual", "pct": 1.1, "n": 159},
   {"category": "Jewish", "pct": 0.6, "n": 90}
  ],
  "Sexual orientation": [
   {"category": "Heterosexual", "pct": 68.0, "n": 9699},
   {"category": "I prefer not to say", "pct": 12.4, "n": 1762},
   {"category": "Not known", "pct": 11.0, "n": 1574},
   {"category": "Bisexual", "pct": 3.7, "n": 525},
   {"category": "Other", "pct": 3.6, "n": 513},
   {"category": "Gay man", "pct": 0.7, "n": 101},
   {"category": "Gay woman/lesbian", "pct": 0.6, "n": 82}
  ],
  "Care leaver status": [
   {"category": "Not known", "pct": 56.4, "n": 8045},
   {"category": "Not a care leaver", "pct": 35.2, "n": 5017},
   {"category": "Not Known", "pct": 7.7, "n": 1099},
   {"category": "In care for more than 3 months", "pct": 0.7, "n": 95}
  ]
 }
};
