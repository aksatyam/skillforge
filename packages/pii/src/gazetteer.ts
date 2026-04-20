/**
 * Seed gazetteer of common Indian first names used for person_name detection.
 *
 * This is NOT an exhaustive list — the goal is *recall on Qualtech-realistic
 * inputs*. The regex anonymizer uses three signals together to claim a
 * person_name:
 *
 *   1. Token matches this gazetteer (case-insensitive)
 *   2. OR: two consecutive Title-Case tokens (e.g. "Priya Iyer") — the heuristic
 *      catches surname compounds the gazetteer misses
 *   3. OR: an entry in `options.extraNames` — per-org live roster lookup
 *
 * Maintenance: add entries when the recall test surfaces a miss on a realistic
 * input. Do NOT mine LinkedIn / scraped datasets — per DPDP Act, the gazetteer
 * itself must only contain generally-public given-name tokens, not directory
 * data.
 */

// Normalized form: lowercase, trimmed. ~200 common Indian first names covering
// North, South, East, West regions + common Anglo names we see in Qualtech data.
// Order doesn't matter — consumed as a Set for O(1) lookup.
export const INDIAN_FIRST_NAMES: readonly string[] = [
  // North / Hindi belt
  "aarav", "aarti", "abhay", "abhishek", "aditi", "aditya", "ajay", "akash",
  "akshay", "alok", "amit", "ananya", "anil", "anita", "ankit", "ankita",
  "anu", "anuj", "anupam", "anusha", "arjun", "arun", "asha", "ashish", "ashok",
  "deepak", "deepika", "dev", "diksha", "dinesh", "divya",
  "gaurav", "geeta", "gopal", "harish", "hemant",
  "ishaan", "jaya", "jyoti", "kajal", "kamal", "kanika", "kapil", "karan",
  "kavita", "kiran", "kirti", "krishna", "kunal", "lakshmi", "madhur",
  "mahesh", "manav", "manish", "manoj", "meena", "meera", "mohan", "mukesh",
  "naveen", "neha", "nidhi", "niraj", "nisha", "nitin",
  "om", "parag", "pooja", "prabhat", "pradeep", "prakash", "pranav", "prateek",
  "praveen", "preeti", "priya", "priyanka", "puja", "rachna", "radha",
  "raghav", "rahul", "raj", "rajeev", "rajesh", "rakesh", "ramesh", "rashmi",
  "ravi", "rekha", "renu", "riya", "rohit", "ruchi", "ruchika",
  "sachin", "sandeep", "sanjay", "sanjeev", "sarita", "seema", "shalini",
  "shankar", "sharad", "shilpa", "shivam", "shreya", "shubham", "shweta",
  "siddharth", "simran", "smita", "sneha", "sonali", "sonia", "sudha",
  "sudhir", "sumit", "sunita", "surendra", "suresh", "sushma", "swati",
  "tanvi", "tarun", "tushar", "usha", "varun", "vedant", "vibha",
  "vijay", "vikas", "vikram", "vinay", "vinod", "vishal", "vivek",
  "yash", "yogita", "yogesh",

  // South Indian (Tamil, Telugu, Kannada, Malayalam)
  "anand", "arvind", "balaji", "chandra", "dinesh", "ganesh", "guru",
  "hari", "karthik", "keshav", "lakshman", "mani", "mohanraj", "murali",
  "nagaraj", "padma", "prasad", "raja", "rajan", "ramachandran", "ramesh",
  "ravi", "sai", "saraswathi", "senthil", "shiva", "sreedhar", "srinivas",
  "subramaniam", "sudhakar", "venkatesh", "vijayalakshmi",
  "iyer", "iyengar", "menon", "nair", "pillai", "reddy", "naidu",

  // Bengali, Marathi, Gujarati, Punjabi
  "aniket", "animesh", "anirban", "arko", "arnab", "atanu", "debashish",
  "gautam", "gourav", "indrajit", "koushik", "manas", "nirmal", "partha",
  "prasenjit", "rajat", "rishi", "samir", "santanu", "saptarshi", "soumya",
  "subhash", "subir", "suman", "sunil", "tapan", "tushar",
  "harpreet", "jaspreet", "jatin", "kulwant", "manpreet", "navjot", "preet",
  "ranjit", "simrat", "sukhwinder", "surjit", "tejbir",

  // Common Anglo first names seen in Qualtech India offices
  "alex", "alice", "andrew", "anna", "ben", "chris", "daniel", "david",
  "elizabeth", "emily", "james", "jane", "jennifer", "john", "joseph",
  "linda", "lisa", "maria", "mark", "mary", "michael", "paul", "peter",
  "richard", "robert", "sarah", "stephen", "thomas", "william",
];

// Frozen Set for O(1) lookup. Built once at module load.
const NAME_SET = new Set(INDIAN_FIRST_NAMES.map((n) => n.toLowerCase()));

export function isKnownGivenName(token: string): boolean {
  return NAME_SET.has(token.toLowerCase());
}
