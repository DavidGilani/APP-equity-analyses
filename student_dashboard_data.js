// Built-in population baseline for the student cohort comparison dashboard.
// Population = whole student population 2025/26 (14,023 students), built from the
// student number download by analysis/build_dashboard_baseline.js. No personal records
// here: counts and percentages only, with categories under 10 students combined.
// Rebuild with that script to refresh. Keep it in the same folder as student_dashboard.html.
window.DASHBOARD_DATA = {
 "META": {
  "generated": "2026-11-02",
  "minCell": 10,
  "popTotal": 14023,
  "populationLabel": "Whole student population (2025/26)",
  "dimensions": [
   "Faculty",
   "Department",
   "Level of study",
   "Mode of study",
   "Residency",
   "Sex",
   "Age on entry",
   "Age group",
   "Ethnicity (BAME grouping)",
   "Ethnicity (broad)",
   "Ethnicity (detailed)",
   "Disability",
   "First generation in HE",
   "Parental HE",
   "Care leaver",
   "IMD quintile",
   "Widening participation flag",
   "Prior qualifications (A-level and BTEC flags)",
   "Entry route",
   "Apprenticeship",
   "Religion"
  ],
  "columnAliases": {
   "Faculty": [
    "faculty",
    "programme faculty"
   ],
   "Department": [
    "department"
   ],
   "Level of study": [
    "level of study",
    "level",
    "student level"
   ],
   "Mode of study": [
    "mode of study",
    "mode"
   ],
   "Residency": [
    "residency",
    "fee status",
    "domicile"
   ],
   "Sex": [
    "sex",
    "gender"
   ],
   "Age on entry": [
    "age on entry",
    "age",
    "mature"
   ],
   "Age group": [
    "age group"
   ],
   "Ethnicity (BAME grouping)": [
    "bame",
    "bame grouping",
    "ethnicity bame"
   ],
   "Ethnicity (broad)": [
    "ethnicity",
    "ethnicity broad",
    "broad ethnicity",
    "ethnic group"
   ],
   "Ethnicity (detailed)": [
    "ethnicity detailed",
    "detailed ethnicity",
    "ethnicity description"
   ],
   "Disability": [
    "disability",
    "disability flag",
    "disabled"
   ],
   "First generation in HE": [
    "first generation in he",
    "first generation",
    "first gen"
   ],
   "Parental HE": [
    "parental he"
   ],
   "Care leaver": [
    "care leaver",
    "care experienced"
   ],
   "IMD quintile": [
    "imd quintile",
    "imd"
   ],
   "Widening participation flag": [
    "widening participation flag"
   ],
   "Prior qualifications (A-level and BTEC flags)": [
    "prior qualifications",
    "prior qualification",
    "entry qualification"
   ],
   "Entry route": [
    "entry route"
   ],
   "Apprenticeship": [
    "apprenticeship"
   ],
   "Religion": [
    "religion",
    "religion or belief"
   ]
  },
  "disclosure": "Population figures are the 2025/26 whole student population (14,023 students), from the student number download filtered as in the EDI report. Your uploaded cohort is compared against these. Groups with fewer than 10 students in your cohort are suppressed and not tested. Significance is a two-proportion z-test at the 95% level. Category labels in your file must match the population labels exactly to line up (see the notes under each chart)."
 },
 "POPULATION": {
  "Faculty": [
   {
    "category": "Business and Law",
    "n": 4513,
    "pct": 32.2
   },
   {
    "category": "Science and Technology",
    "n": 4165,
    "pct": 29.7
   },
   {
    "category": "Health, Social Care and Education",
    "n": 3794,
    "pct": 27.1
   },
   {
    "category": "Arts and Creative Industries",
    "n": 1514,
    "pct": 10.8
   },
   {
    "category": "No faculty",
    "n": 37,
    "pct": 0.3
   }
  ],
  "Department": [
   {
    "category": "Strategy, Leadership and Operations",
    "n": 2654,
    "pct": 18.9
   },
   {
    "category": "Adult, Child and Midwifery",
    "n": 2002,
    "pct": 14.3
   },
   {
    "category": "Computer Science",
    "n": 1446,
    "pct": 10.3
   },
   {
    "category": "Mental Health and Social Work",
    "n": 1083,
    "pct": 7.7
   },
   {
    "category": "Natural Sciences",
    "n": 1078,
    "pct": 7.7
   },
   {
    "category": "School of Design",
    "n": 962,
    "pct": 6.9
   },
   {
    "category": "Psychology",
    "n": 946,
    "pct": 6.7
   },
   {
    "category": "Law and Social Sciences",
    "n": 728,
    "pct": 5.2
   },
   {
    "category": "Education",
    "n": 709,
    "pct": 5.1
   },
   {
    "category": "Accounting, Finance and Economics",
    "n": 592,
    "pct": 4.2
   },
   {
    "category": "Marketing, Enterprise and Tourism",
    "n": 538,
    "pct": 3.8
   },
   {
    "category": "Sports",
    "n": 394,
    "pct": 2.8
   },
   {
    "category": "School of Arts",
    "n": 305,
    "pct": 2.2
   },
   {
    "category": "Design Engineering and Mathematics",
    "n": 282,
    "pct": 2
   },
   {
    "category": "School of Film",
    "n": 247,
    "pct": 1.8
   },
   {
    "category": "Academic Registry",
    "n": 30,
    "pct": 0.2
   },
   {
    "category": "Research Degree Committee",
    "n": 19,
    "pct": 0.1
   },
   {
    "category": "Groups under 10 combined",
    "n": 8,
    "pct": 0.1
   }
  ],
  "Level of study": [
   {
    "category": "Undergraduate",
    "n": 9805,
    "pct": 69.9
   },
   {
    "category": "Postgraduate taught",
    "n": 3405,
    "pct": 24.3
   },
   {
    "category": "Postgraduate research",
    "n": 804,
    "pct": 5.7
   },
   {
    "category": "Groups under 10 combined",
    "n": 9,
    "pct": 0.1
   }
  ],
  "Mode of study": [
   {
    "category": "Full time",
    "n": 11866,
    "pct": 84.6
   },
   {
    "category": "Part time",
    "n": 2157,
    "pct": 15.4
   }
  ],
  "Residency": [
   {
    "category": "UK",
    "n": 9254,
    "pct": 66
   },
   {
    "category": "Overseas",
    "n": 4725,
    "pct": 33.7
   },
   {
    "category": "EU",
    "n": 27,
    "pct": 0.2
   },
   {
    "category": "Other or not resolved",
    "n": 11,
    "pct": 0.1
   }
  ],
  "Sex": [
   {
    "category": "Female",
    "n": 8129,
    "pct": 58
   },
   {
    "category": "Male",
    "n": 5817,
    "pct": 41.5
   },
   {
    "category": "Other",
    "n": 77,
    "pct": 0.5
   }
  ],
  "Age on entry": [
   {
    "category": "21 and over",
    "n": 8120,
    "pct": 57.9
   },
   {
    "category": "Under 21",
    "n": 5903,
    "pct": 42.1
   }
  ],
  "Age group": [
   {
    "category": "16-20",
    "n": 5903,
    "pct": 42.1
   },
   {
    "category": "30+",
    "n": 3466,
    "pct": 24.7
   },
   {
    "category": "21-24",
    "n": 3068,
    "pct": 21.9
   },
   {
    "category": "25-29",
    "n": 1586,
    "pct": 11.3
   }
  ],
  "Ethnicity (BAME grouping)": [
   {
    "category": "BAME",
    "n": 10293,
    "pct": 73.4
   },
   {
    "category": "White",
    "n": 3473,
    "pct": 24.8
   },
   {
    "category": "Unknown",
    "n": 257,
    "pct": 1.8
   }
  ],
  "Ethnicity (broad)": [
   {
    "category": "Asian",
    "n": 5464,
    "pct": 39
   },
   {
    "category": "White",
    "n": 3476,
    "pct": 24.8
   },
   {
    "category": "Black",
    "n": 3020,
    "pct": 21.5
   },
   {
    "category": "Other",
    "n": 1114,
    "pct": 7.9
   },
   {
    "category": "Mixed",
    "n": 692,
    "pct": 4.9
   },
   {
    "category": "Not known",
    "n": 257,
    "pct": 1.8
   }
  ],
  "Ethnicity (detailed)": [
   {
    "category": "Asian-Indian",
    "n": 2436,
    "pct": 17.4
   },
   {
    "category": "Black-African",
    "n": 2408,
    "pct": 17.2
   },
   {
    "category": "White",
    "n": 1611,
    "pct": 11.5
   },
   {
    "category": "White-British",
    "n": 1165,
    "pct": 8.3
   },
   {
    "category": "Other Asian Background",
    "n": 1032,
    "pct": 7.4
   },
   {
    "category": "Arab",
    "n": 784,
    "pct": 5.6
   },
   {
    "category": "Chinese",
    "n": 738,
    "pct": 5.3
   },
   {
    "category": "Asian-Pakistani",
    "n": 678,
    "pct": 4.8
   },
   {
    "category": "Asian-Bangladeshi",
    "n": 580,
    "pct": 4.1
   },
   {
    "category": "Other White Background",
    "n": 563,
    "pct": 4
   },
   {
    "category": "Black-Caribbean",
    "n": 437,
    "pct": 3.1
   },
   {
    "category": "Other Ethnic Background",
    "n": 330,
    "pct": 2.4
   },
   {
    "category": "Other Mixed Background",
    "n": 295,
    "pct": 2.1
   },
   {
    "category": "Other Black Background",
    "n": 175,
    "pct": 1.2
   },
   {
    "category": "Mixed-White/Black Caribbean",
    "n": 154,
    "pct": 1.1
   },
   {
    "category": "Mixed-White/Black African",
    "n": 139,
    "pct": 1
   },
   {
    "category": "Not Given",
    "n": 139,
    "pct": 1
   },
   {
    "category": "Refused to answer",
    "n": 113,
    "pct": 0.8
   },
   {
    "category": "Mixed-White/Asian",
    "n": 104,
    "pct": 0.7
   },
   {
    "category": "White-Irish",
    "n": 99,
    "pct": 0.7
   },
   {
    "category": "White Welsh",
    "n": 18,
    "pct": 0.1
   },
   {
    "category": "White-Scottish",
    "n": 17,
    "pct": 0.1
   },
   {
    "category": "Groups under 10 combined",
    "n": 8,
    "pct": 0.1
   }
  ],
  "Disability": [
   {
    "category": "No reported disability",
    "n": 11682,
    "pct": 83.3
   },
   {
    "category": "Reported disability",
    "n": 2341,
    "pct": 16.7
   }
  ],
  "First generation in HE": [
   {
    "category": "Yes",
    "n": 8142,
    "pct": 58.1
   },
   {
    "category": "No",
    "n": 5871,
    "pct": 41.9
   }
  ],
  "Parental HE": [
   {
    "category": "No",
    "n": 6132,
    "pct": 44.4
   },
   {
    "category": "Yes",
    "n": 5871,
    "pct": 42.5
   },
   {
    "category": "Don't know",
    "n": 851,
    "pct": 6.2
   },
   {
    "category": "Not Applicable",
    "n": 504,
    "pct": 3.7
   },
   {
    "category": "Information refused",
    "n": 238,
    "pct": 1.7
   },
   {
    "category": "No Response Given",
    "n": 202,
    "pct": 1.5
   }
  ],
  "Care leaver": [
   {
    "category": "Not a care leaver",
    "n": 5050,
    "pct": 98.1
   },
   {
    "category": "Care leaver",
    "n": 98,
    "pct": 1.9
   }
  ],
  "IMD quintile": [
   {
    "category": "Quintile 2",
    "n": 2810,
    "pct": 33.4
   },
   {
    "category": "Quintile 1 (most deprived)",
    "n": 1892,
    "pct": 22.5
   },
   {
    "category": "Quintile 3",
    "n": 1835,
    "pct": 21.8
   },
   {
    "category": "Quintile 4",
    "n": 1154,
    "pct": 13.7
   },
   {
    "category": "Quintile 5 (least deprived)",
    "n": 711,
    "pct": 8.5
   }
  ],
  "Widening participation flag": [
   {
    "category": "Yes",
    "n": 13424,
    "pct": 96.1
   },
   {
    "category": "No",
    "n": 540,
    "pct": 3.9
   }
  ],
  "Prior qualifications (A-level and BTEC flags)": [
   {
    "category": "Neither",
    "n": 10783,
    "pct": 79.1
   },
   {
    "category": "A-levels",
    "n": 1282,
    "pct": 9.4
   },
   {
    "category": "BTEC",
    "n": 1197,
    "pct": 8.8
   },
   {
    "category": "A-levels and BTEC",
    "n": 363,
    "pct": 2.7
   }
  ],
  "Entry route": [
   {
    "category": "Not through UCAS",
    "n": 8097,
    "pct": 57.7
   },
   {
    "category": "UCAS main cycle",
    "n": 4106,
    "pct": 29.3
   },
   {
    "category": "UCAS Clearing",
    "n": 1820,
    "pct": 13
   }
  ],
  "Apprenticeship": [
   {
    "category": "Not an apprentice",
    "n": 13169,
    "pct": 93.9
   },
   {
    "category": "Apprentice",
    "n": 854,
    "pct": 6.1
   }
  ],
  "Religion": [
   {
    "category": "Christian",
    "n": 4388,
    "pct": 32.4
   },
   {
    "category": "Muslim",
    "n": 3357,
    "pct": 24.8
   },
   {
    "category": "No religion or belief",
    "n": 2663,
    "pct": 19.7
   },
   {
    "category": "Hindu",
    "n": 1721,
    "pct": 12.7
   },
   {
    "category": "I prefer not to say",
    "n": 521,
    "pct": 3.8
   },
   {
    "category": "Buddhist",
    "n": 231,
    "pct": 1.7
   },
   {
    "category": "Spiritual",
    "n": 197,
    "pct": 1.5
   },
   {
    "category": "Any other religion or belief",
    "n": 191,
    "pct": 1.4
   },
   {
    "category": "Sikh",
    "n": 170,
    "pct": 1.3
   },
   {
    "category": "Jewish",
    "n": 95,
    "pct": 0.7
   }
  ]
 }
};
