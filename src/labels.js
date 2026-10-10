// Display names for Rampart's labels, grouped for the settings page. CITY,
// STATE and ZIP_CODE are in Rampart's KEEP_LABELS and never reach us, so they
// are named here but not offered as categories.

export const LABEL_NAMES = {
  GIVEN_NAME: "First name",
  SURNAME: "Last name",
  EMAIL: "Email",
  PHONE: "Phone number",
  URL: "URL",
  SSN: "SSN",
  CREDIT_CARD: "Card number",
  IP_ADDRESS: "IP address",
  TAX_ID: "Tax ID",
  BANK_ACCOUNT: "Bank account",
  ROUTING_NUMBER: "Routing number",
  GOVERNMENT_ID: "Government ID",
  PASSPORT: "Passport number",
  DRIVERS_LICENSE: "Driver's license",
  BUILDING_NUMBER: "Building number",
  STREET_NAME: "Street",
  SECONDARY_ADDRESS: "Apartment / unit",
  CITY: "City",
  STATE: "State",
  ZIP_CODE: "ZIP code",
};

export const CATEGORY_GROUPS = [
  { name: "Names", labels: ["GIVEN_NAME", "SURNAME"] },
  { name: "Contact and web", labels: ["EMAIL", "PHONE", "URL", "IP_ADDRESS"] },
  { name: "Address", labels: ["BUILDING_NUMBER", "STREET_NAME", "SECONDARY_ADDRESS"] },
  {
    name: "Financial and government IDs",
    labels: ["SSN", "CREDIT_CARD", "BANK_ACCOUNT", "ROUTING_NUMBER", "TAX_ID", "GOVERNMENT_ID", "PASSPORT", "DRIVERS_LICENSE"],
  },
];

export const labelName = (label) => LABEL_NAMES[label] ?? label.toLowerCase().replaceAll("_", " ");
