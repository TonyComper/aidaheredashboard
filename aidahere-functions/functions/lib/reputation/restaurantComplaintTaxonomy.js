// functions/lib/reputation/restaurantComplaintTaxonomy.js

const RESTAURANT_COMPLAINT_TAXONOMY = [
  {
    type: "FOOD_QUALITY",
    label: "Food Quality",
    patterns: [
      {
        key: "food_taste_bad",
        label: "Bad taste / poor flavor",
        keywords: [
          "tasteless",
          "bland",
          "flavorless",
          "bad taste",
          "terrible taste",
          "terrible flavor",
          "bad flavor",
          "poor flavor",
          "disgusting",
          "gross",
          "awful food",
          "not edible",
          "inedible",
          "salty",
          "too salty",
          "burnt taste",
          "sour",
          "stale tasting",
          "quality has gone way down",
          "quality went down",
          "poor quality",
          "low quality",
          "very disappointing",
          "disappointing"
        ]
      },
      {
        key: "food_overcooked_undercooked",
        label: "Overcooked / undercooked",
        keywords: [
          "overcooked",
          "undercooked",
          "raw inside",
          "burnt",
          "burned",
          "dry chicken",
          "dry meat",
          "rubbery",
          "tough meat",
          "not cooked through"
        ]
      },
      {
        key: "food_cold",
        label: "Food served cold",
        keywords: [
          "cold food",
          "food was cold",
          "served cold",
          "fries were cold",
          "burger was cold",
          "pizza was cold",
          "meal was cold",
          "not hot"
        ]
      },
      {
        key: "food_not_fresh",
        label: "Not fresh / stale",
        keywords: [
          "not fresh",
          "stale",
          "old food",
          "food was old",
          "it was old",
          "expired",
          "spoiled",
          "soggy",
          "wilted",
          "dry bread",
          "hard bread",
          "quality has gone way down"
        ]
      },
      {
        key: "portion_small",
        label: "Small portion / poor value portion",
        keywords: [
          "small portion",
          "tiny portion",
          "portion was small",
          "not enough food",
          "very little food",
          "skimpy",
          "too small for the price",
          "portions have gotten smaller"
        ]
      }
    ]
  },
  {
    type: "ORDER_ACCURACY",
    label: "Order Accuracy",
    patterns: [
      {
        key: "wrong_order",
        label: "Wrong order",
        keywords: [
          "wrong order",
          "got the wrong order",
          "incorrect order",
          "mixed up order",
          "someone else's order"
        ]
      },
      {
        key: "missing_items",
        label: "Missing items",
        keywords: [
          "missing item",
          "items missing",
          "forgot my",
          "didn't include",
          "did not include",
          "left out",
          "missing sauce",
          "missing fries",
          "missing drink",
          "missing order"
        ]
      },
      {
        key: "wrong_customization",
        label: "Wrong customization / modifiers missed",
        keywords: [
          "no cheese",
          "added cheese when i said no",
          "ignored instructions",
          "wrong toppings",
          "wrong sauce",
          "wrong bread",
          "customization was wrong",
          "special instructions ignored"
        ]
      }
    ]
  },
  {
    type: "SERVICE",
    label: "Service",
    patterns: [
      {
        key: "staff_rude",
        label: "Rude staff",
        keywords: [
          "rude",
          "very rude",
          "staff was rude",
          "cashier was rude",
          "server was rude",
          "unfriendly",
          "dismissive",
          "attitude",
          "mixed feelings",
          "bad attitude",
          "impolite"
        ]
      },
      {
        key: "staff_unprofessional",
        label: "Unprofessional service",
        keywords: [
          "unprofessional",
          "unhelpful",
          "didn't care",
          "careless",
          "poor customer service",
          "bad service",
          "terrible service",
          "awful service"
        ]
      },
      {
        key: "manager_issue",
        label: "Manager complaint",
        keywords: [
          "manager was rude",
          "manager didn't help",
          "spoke to manager",
          "manager refused",
          "management issue",
          "owner was rude",
          "supervisor"
        ]
      }
    ]
  },
  {
    type: "SPEED",
    label: "Speed / Wait Time",
    patterns: [
      {
        key: "slow_service",
        label: "Slow service",
        keywords: [
          "slow service",
          "service was slow",
          "took forever",
          "very slow",
          "long wait",
          "waited too long",
          "took too long",
          "forever to get food"
        ]
      },
      {
        key: "pickup_delay",
        label: "Pickup delay",
        keywords: [
          "pickup was delayed",
          "order wasn't ready",
          "not ready on time",
          "had to wait for pickup",
          "pickup took too long"
        ]
      },
      {
        key: "delivery_delay",
        label: "Delivery delay",
        keywords: [
          "late delivery",
          "delivery was late",
          "took too long to deliver",
          "delivery took forever",
          "arrived late"
        ]
      }
    ]
  },
  {
    type: "CLEANLINESS",
    label: "Cleanliness",
    patterns: [
      {
        key: "dirty_dining_area",
        label: "Dirty dining area",
        keywords: [
          "dirty",
          "filthy",
          "messy",
          "unclean",
          "tables were dirty",
          "floor was dirty",
          "dining room was dirty"
        ]
      },
      {
        key: "dirty_washroom",
        label: "Dirty washroom",
        keywords: [
          "dirty bathroom",
          "dirty washroom",
          "washroom was dirty",
          "restroom was dirty",
          "bathroom filthy"
        ]
      },
      {
        key: "food_hygiene_concern",
        label: "Food hygiene concern",
        keywords: [
          "hair in food",
          "found hair",
          "bug in food",
          "insect in food",
          "dirty utensils",
          "dirty plate",
          "unclean food preparation"
        ]
      }
    ]
  },
  {
    type: "VALUE_PRICING",
    label: "Value / Pricing",
    patterns: [
      {
        key: "too_expensive",
        label: "Too expensive",
        keywords: [
          "too expensive",
          "overpriced",
          "not worth the price",
          "way too expensive",
          "pricey",
          "expensive for what it is"
        ]
      },
      {
        key: "poor_value",
        label: "Poor value",
        keywords: [
          "poor value",
          "not worth it",
          "not worth the price",
          "waste of money",
          "rip off",
          "felt ripped off",
          "for that price i was expecting good food",
          "too small for the price"
        ]
      },
      {
        key: "price_mismatch",
        label: "Price mismatch / overcharge",
        keywords: [
          "overcharged",
          "charged extra",
          "price was wrong",
          "bill was wrong",
          "menu price was different",
          "unexpected charge"
        ]
      }
    ]
  },
  {
    type: "DELIVERY_PACKAGING",
    label: "Delivery / Packaging",
    patterns: [
      {
        key: "packaging_poor",
        label: "Poor packaging",
        keywords: [
          "bad packaging",
          "packaging was bad",
          "container leaked",
          "spilled in the bag",
          "food spilled",
          "packaging fell apart",
          "soggy from packaging"
        ]
      },
      {
        key: "delivery_damaged",
        label: "Damaged delivery",
        keywords: [
          "arrived damaged",
          "crushed",
          "spilled",
          "leaked",
          "ruined in transit"
        ]
      }
    ]
  },
  {
    type: "AMBIENCE_FACILITY",
    label: "Ambience / Facility",
    patterns: [
      {
        key: "too_loud",
        label: "Too loud / noisy",
        keywords: [
          "too loud",
          "very loud",
          "noisy",
          "music was too loud",
          "couldn't hear"
        ]
      },
      {
        key: "too_hot_cold_inside",
        label: "Temperature discomfort",
        keywords: [
          "too hot inside",
          "too cold inside",
          "air conditioning not working",
          "no ac",
          "freezing inside"
        ]
      },
      {
        key: "poor_seating",
        label: "Seating / comfort issue",
        keywords: [
          "uncomfortable seating",
          "nowhere to sit",
          "crowded",
          "dirty seats",
          "small tables"
        ]
      }
    ]
  },
  {
    type: "SAFETY",
    label: "Safety",
    patterns: [
      {
        key: "food_safety",
        label: "Food safety concern",
        keywords: [
          "food poisoning",
          "got sick",
          "became sick",
          "made me sick",
          "unsafe food",
          "undercooked chicken",
          "raw chicken"
        ]
      },
      {
        key: "physical_safety",
        label: "Physical safety concern",
        keywords: [
          "slipped",
          "fell",
          "unsafe",
          "dangerous",
          "hazard",
          "broken floor",
          "wet floor"
        ]
      }
    ]
  }
];

module.exports = {
  RESTAURANT_COMPLAINT_TAXONOMY,
};