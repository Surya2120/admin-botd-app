export const defaultSeasonContent = {
  hero: {
    eyebrow: "Season 1 Overview",
    title: "Season 1 - Bangalore Edition",
    subtitle: "The beginning of the BOTD journey.",
    bannerImage: "assets/images/poster2.jpg",
    ctaLabel: "Register Now",
    ctaHref: "register.html",
    meta: [
      { id: "location", label: "Location", value: "TBA" },
      { id: "date", label: "Date", value: "TBA" },
      { id: "venue", label: "Venue", value: "TBA" },
      { id: "prize", label: "Cash Prize", value: "x,xx,xxx/-" }
    ]
  },
  dashboardHeading: {
    eyebrow: "Season Dashboard",
    title: "Everything you need to know about Season 1",
    description:
      "Explore the launch season through focused sections designed to keep details clear, structured, and easy to scan."
  },
  aboutBox: {
    title: "About Season 1",
    content:
      "Season 1 marks the launch of BOTD, bringing together emerging dancers from Bangalore to compete on a professional stage."
  },
  categoryFeeBoxes: [
    {
      id: "solo",
      title: "Solo",
      description: "Solo fee and prize information",
      image: "",
      buttonLabel: "",
      buttonHref: "",
      items: ["Entry: Rs xxxx", "Winner: Rs xx,xxx", "Runner: Rs x,xxx", "Slots: 20"]
    },
    {
      id: "group",
      title: "Group",
      description: "Group fee and prize information",
      image: "",
      buttonLabel: "",
      buttonHref: "",
      items: ["Entry: Rs x,xxx", "Winner: Rs xx,xxx", "Runner: Rs x,xxx", "Slots: 30"]
    },
    {
      id: "eligibility",
      title: "Age Eligibility",
      description: "6 to 35 years",
      image: "",
      buttonLabel: "",
      buttonHref: "",
      items: []
    }
  ]
};

export const defaultRulesContent = {
  title: "Battle of the Dance - Rules & Regulations",
  content:
    "<h3>Eligibility & Registration</h3><ul><li>Participants must be residents of Bangalore.</li><li>A valid Aadhar card must be presented on the day of video recording.</li><li>Entry fees once paid are non-refundable.</li><li>No changes in registrations after submission.</li><li>Consent form must be signed.</li></ul><h3>Performance Guidelines</h3><ul><li>Duration: 1.5 to 3.5 minutes</li><li>Styles: Hip-hop, freestyle, western</li><li>No vulgar content</li><li>Original choreography required</li></ul><h3>Event Day Protocol</h3><ul><li>Time slots will be assigned</li><li>Arrive 30 minutes early</li><li>No audience allowed during recording</li><li>Be ready before your slot</li></ul><h3>Judging & Voting</h3><ul><li>Judges announce scores on the spot</li><li>Judges' decisions are final</li><li>Audience voting after upload</li><li>No late votes</li><li>No manipulation</li></ul><h3>Conduct & Disqualification</h3><ul><li>Misbehavior leads to removal</li><li>Maintain discipline backstage</li><li>No phone usage during performance</li><li>Organizers not responsible for belongings</li></ul><h3>Media & Promotion</h3><ul><li>Do not share performance before release</li><li>May be called for promotion</li><li>Content can be used by BOTD</li></ul>",
  rulebookUrl: "",
  currentVersion: 1
};

export const defaultCategories = [
  { id: "adult-group", code: "AG", name: "Adult Group", description: "15 teams", image: "", isActive: true },
  { id: "kids-group", code: "KG", name: "Kids Group", description: "15 teams", image: "", isActive: true },
  { id: "kids-solo", code: "KS", name: "Kids Solo", description: "10 dancers", image: "", isActive: true },
  { id: "open-solo", code: "OS", name: "Open Solo", description: "10 dancers", image: "", isActive: true }
];

export const defaultContestants = [
  ...Array.from({ length: 15 }, (_, index) => ({
    id: `ag-${index + 1}`,
    name: ["Team Alpha", "Team Beta", "Team Gamma", "Team Delta", "Team Epsilon", "Team Zeta", "Team Eta", "Team Theta", "Team Iota", "Team Kappa", "Team Lambda", "Team Mu", "Team Nu", "Team Xi", "Team Omicron"][index],
    city: "Bangalore",
    image: `assets/images/Contestent/AG/AG_CON_ (${index + 1}).jpg`,
    categoryId: "AG",
    bio: "",
    buttonLabel: "",
    buttonHref: "",
    votes: 0,
    isVisible: true
  })),
  ...Array.from({ length: 15 }, (_, index) => ({
    id: `kg-${index + 1}`,
    name: ["Team Pulse", "Team Spark", "Team Motion", "Team Orbit", "Team Junior Beat", "Team Rhythm Kids", "Team Flash", "Team Bounce", "Team Starlight", "Team Junior Crew", "Team Echo", "Team Nova", "Team Tiny Troupe", "Team Rocket", "Team Young Vibe"][index],
    city: "Bangalore",
    image: `assets/images/Contestent/KG/KG_CON_ (${index + 1}).jpg`,
    categoryId: "KG",
    bio: "",
    buttonLabel: "",
    buttonHref: "",
    votes: 0,
    isVisible: true
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `ks-${index + 1}`,
    name: `Dancer ${index + 1}`,
    city: "Bangalore",
    image: `assets/images/Contestent/KS/KS_CON_ (${index + 1}).jpg`,
    categoryId: "KS",
    bio: "",
    buttonLabel: "",
    buttonHref: "",
    votes: 0,
    isVisible: true
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `os-${index + 1}`,
    name: ["Dancer Alpha", "Dancer Beta", "Dancer Gamma", "Dancer Delta", "Dancer Epsilon", "Dancer Zeta", "Dancer Eta", "Dancer Theta", "Dancer Iota", "Dancer Kappa"][index],
    city: "Bangalore",
    image: `assets/images/Contestent/OS/OS_CON_ (${index + 1}).jpg`,
    categoryId: "OS",
    bio: "",
    buttonLabel: "",
    buttonHref: "",
    votes: 0,
    isVisible: true
  }))
];

export const defaultJudges = [
  { id: "judge-a", name: "Judge A", designation: "Choreographer", image: "assets/images/judges/j1.png", bio: "", isVisible: true },
  { id: "judge-b", name: "Judge B", designation: "Performer", image: "assets/images/judges/j2.png", bio: "", isVisible: true },
  { id: "judge-c", name: "Judge C", designation: "Industry Professional", image: "assets/images/judges/j3.png", bio: "", isVisible: true }
];

export const defaultEventsContent = {
  hero: {
    eyebrow: "BOTD Events",
    title: "BOTD Events",
    subtitle: "Experience the journey from audition to stage.",
    description: "Track every step of Season 1.",
    image: "assets/images/poster3.jpg"
  },
  banner: {
    eyebrow: "Season 1 Highlight",
    title: "Season 1 - Bangalore Edition",
    description: "The first BOTD season begins here, with a structured journey from submission to final recognition.",
    buttonLabel: "Register Now",
    buttonHref: "register.html",
    meta: [
      { id: "location", label: "Location", value: "TBA" },
      { id: "date", label: "Date", value: "TBA" },
      { id: "venue", label: "Venue", value: "TBA" }
    ]
  },
  notes: [
    "Participants must follow assigned time slots",
    "Updates will be shared through official channels",
    "Only selected participants proceed to next stages"
  ],
  stages: [
    { id: "stage-1", order: 1, title: "Audition Submission", description: "Submit your performance video and begin your BOTD journey with the first audition round.", status: "Open", image: "", enabled: true },
    { id: "stage-2", order: 2, title: "Shortlisting", description: "Selected performances move forward to the next stage based on quality, clarity, and stage potential.", status: "Upcoming", image: "", enabled: true },
    { id: "stage-3", order: 3, title: "Live Recording", description: "Shortlisted participants perform in a professional setup before judges and BOTD production.", status: "Upcoming", image: "", enabled: true },
    { id: "stage-4", order: 4, title: "Voting Phase", description: "Audience voting begins once performances are published and enters the final scoring process.", status: "Upcoming", image: "", enabled: true },
    { id: "stage-5", order: 5, title: "Final Results", description: "Winners are announced based on the combined result of judges' scores and audience voting.", status: "Upcoming", image: "", enabled: true }
  ]
};

export const defaultVotingContent = {
  title: "Vote Your Favorite Performer",
  subtitle: "Support the talent you believe in.",
  seasonLabel: "Season 1",
  seasonValue: "Bangalore Edition",
  introText: "Choose your performer carefully and submit one fair vote per mobile number.",
  votingOpen: false,
  closedMessage: "Voting is currently closed. Please check back later.",
  rulesText: "One vote per mobile number. OTP verification required.",
  announcement: ""
};

export const defaultSponsors = [
  { id: "gold-1", name: "Gold Sponsor One", link: "", tier: "Gold", image: "", sortOrder: 1, visible: true },
  { id: "gold-2", name: "Gold Sponsor Two", link: "", tier: "Gold", image: "", sortOrder: 2, visible: true },
  { id: "gold-3", name: "Gold Sponsor Three", link: "", tier: "Gold", image: "", sortOrder: 3, visible: true },
  { id: "silver-1", name: "Silver Sponsor One", link: "", tier: "Silver", image: "", sortOrder: 4, visible: true },
  { id: "silver-2", name: "Silver Sponsor Two", link: "", tier: "Silver", image: "", sortOrder: 5, visible: true },
  { id: "bronze-1", name: "Bronze Sponsor One", link: "", tier: "Bronze", image: "", sortOrder: 6, visible: true }
];
