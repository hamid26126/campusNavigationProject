/*
 * Extra information shown in the place drawer, the freshers' tour and the
 * About card.
 *
 * Sourcing note: the "about" facts and the library / Main Block details come
 * from public sources (Wikipedia, THE, QS pages) as of Oct 2026. The
 * "inside" and "tips" lists are GENERAL guidance written for this prototype
 * (typical contents of such places) - they are drafts to be confirmed by
 * UET staff/students before the final version. Opening hours and phone
 * numbers are intentionally NOT included because they are not verified.
 */
(function (root) {
  var INFO = {
    about: {
      title: "About UET Lahore",
      facts: [
        { k: "Founded", v: "1921 as Mughalpura Technical College; renamed Maclagan Engineering College in 1923" },
        { k: "Named UET", v: "1972" },
        { k: "Campus", v: "About 300 acres on Grand Trunk Road, a few km from Shalimar Gardens" },
        { k: "Students", v: "Roughly 12,000 across undergraduate, master's and PhD programmes" },
        { k: "Sub-campuses", v: "Rachna (Wazirabad), Faisalabad, New Campus (Kala Shah Kaku), Narowal" },
        { k: "Fun fact", v: "Computer Science is the highest-merit undergraduate discipline" },
        { k: "Centenary", v: "A commemorative coin and postage stamp were issued in January 2022" }
      ],
      source: "Sources: Wikipedia (UET Lahore), Times Higher Education, QS profile.",
      didYouKnow: [
        "The Main Block's foundation stone was laid by Sir Edward Maclagan, then Governor of the Punjab.",
        "UET's central library was chosen by HEC as a primary resource centre for engineering education.",
        "UET celebrated its 100th anniversary in 2021-22 with a commemorative coin and stamp.",
        "The university began as Mughalpura Technical College in 1921."
      ]
    },

    // generic tips used when a place has no specific entry
    defaultTips: {
      department: ["Check the notice board near the entrance for timetables and announcements.", "Lab sessions usually need a lab file/manual - ask your instructor."],
      lab: ["Labs often have separate entry rules - follow your instructor's safety briefing.", "Bring your lab manual and student ID."],
      hostel: ["Ask the hostel office about visiting rules and mess timings."],
      food: ["Peak rush is right after lecture slots - go a few minutes early or late."],
      admin: ["Bring your original student ID and a photocopy of any document you submit."],
      sports: ["Check with the sports office for ground booking and society trials."],
      default: ["Ask a senior student if you can't find the entrance - buildings can have more than one door."]
    },

    places: {
      main_gate: {
        inside: ["Security check point", "Pedestrian and vehicle entry"],
        tips: ["Keep your student ID or admission slip handy.", "From here, head north along the central road - it leads straight to the Main Block."]
      },
      main_block: {
        inside: ["Vice-Chancellor's office", "Registrar's office", "Administrative sections"],
        areas: ["Heritage building, the oldest on campus"],
        tips: ["Foundation stone laid by Sir Edward Maclagan; the college took his name in 1923.", "Good meeting point - easy to spot from the central road."]
      },
      admissions: {
        inside: ["Admission enquiries", "Merit list and form help"],
        tips: ["Carry copies of your academic documents and CNIC/B-Form."]
      },
      accounts: {
        inside: ["Fee vouchers / challans", "Accounts enquiries"],
        tips: ["Fee is normally paid through a bank challan - confirm the current process here."]
      },
      exam_office: {
        inside: ["Results", "Transcripts", "Degree verification"],
        tips: ["For transcripts or verification, ask about required forms before queuing."]
      },
      student_affairs: {
        inside: ["Student ID cards", "Society and event permissions", "Student welfare queries"]
      },
      library: {
        inside: ["Reading halls", "Book bank (textbook lending)", "Journals, theses and digital resources"],
        areas: ["Seating for around 400 readers", "125,000+ volumes of books"],
        tips: ["The National Library of Engineering Science is one of the largest engineering libraries in the country.", "Ask the book bank desk how textbook lending works for your semester."]
      },
      it_centre: {
        inside: ["Campus network and Wi-Fi support", "Student portal / LMS help"]
      },
      exam_hall: {
        inside: ["Mid-term and final exam seating"],
        tips: ["Seating lists are normally posted outside before each paper - arrive early to find your seat."]
      },
      dept_cs: {
        inside: ["Faculty offices", "Classrooms", "Final-year project (FYP) coordination"],
        areas: ["Programming", "Software engineering", "Data & AI", "Networks and systems"],
        tips: ["Computer labs are in the neighbouring lab building - see 'Inside this building' below."]
      },
      dept_ee: {
        areas: ["Power systems", "Electronics", "Communications", "Control systems"],
        inside: ["Faculty offices", "Classrooms", "Electrical labs next door"]
      },
      dept_me: {
        areas: ["Thermal & fluids", "Design & manufacturing", "Mechatronics"],
        inside: ["Faculty offices", "Classrooms", "Workshops and labs next door"]
      },
      dept_ce: {
        areas: ["Structures", "Geotechnical", "Water resources", "Surveying"],
        inside: ["Faculty offices", "Classrooms", "Materials labs next door"]
      },
      dept_chem: {
        areas: ["Process engineering", "Polymers", "Metallurgy & materials"],
        inside: ["Faculty offices", "Process labs next door"]
      },
      dept_arch: {
        areas: ["Design studios", "Building technology", "Planning & history"],
        inside: ["Studios", "Jury / presentation rooms", "Model-making space"],
        tips: ["Studio work often runs late - the building can be busy in the evening."]
      },
      dept_basic: {
        areas: ["Mathematics", "Physics", "Chemistry", "Humanities & languages"],
        inside: ["Classrooms", "Faculty offices", "First-year science labs next door"]
      },
      lecture_halls: {
        inside: ["Large lecture theatres used by many departments"],
        tips: ["First-year classes are often held here - check room numbers on your timetable."]
      },
      auditorium: { inside: ["Seminars", "Society events", "Convocation-style ceremonies"] },
      cafeteria: {
        inside: ["Multiple food counters", "Seating area"],
        tips: ["Cash or mobile wallet is usually the safe bet - confirm what counters accept."]
      },
      tea_point: { inside: ["Tea", "Snacks"], tips: ["Handy break between library sessions."] },
      mosque: {
        inside: ["Main prayer hall", "Wudu area"],
        tips: ["Jummah prayer gets crowded - arrive early."]
      },
      dispensary: {
        inside: ["First aid", "Basic medical consultation"],
        tips: ["In an emergency, tell any guard or teacher - they can direct or call for help quickly."]
      },
      bank_atm: { inside: ["ATM", "Bank counter"] },
      post_office: { inside: ["Postal and courier services"] },
      photocopy: { inside: ["Photocopy", "Printing", "Stationery"], tips: ["Handy for assignment printouts - queues build before deadlines."] },
      bus_stop: { inside: ["University transport pick-up / drop-off"] },
      parking: { inside: ["Car and motorcycle parking"], tips: ["Park inside marked areas only."] },
      cricket_ground: { inside: ["Cricket pitch", "Open ground for football and events"] },
      gym: { inside: ["Gym equipment", "Indoor games (e.g. table tennis, badminton)"] },
      hostel_boys_a: { inside: ["Student rooms", "Common areas"], tips: ["Name of this block is a placeholder - to be confirmed."] },
      hostel_boys_b: { inside: ["Student rooms", "Common areas"] },
      hostel_girls: { inside: ["Student rooms", "Common areas"] },
      girls_common: { inside: ["Rest and study area for female students"] },
      placement: {
        inside: ["Internship and job postings", "Employer visits", "CV guidance"],
        tips: ["Visit early in your final year to learn about recruitment drives."]
      }
    },

    // Freshers' tour: ordered stops with a short story each
    tour: [
      { id: "main_gate", title: "Welcome to UET", text: "You're at the Main Gate on GT Road. Campus spreads across roughly 300 acres - don't worry, the central road leads you almost everywhere." },
      { id: "main_block", title: "The Main Block", text: "The oldest building on campus. Its foundation stone was laid by Sir Edward Maclagan, and the college carried his name from 1923. The Vice-Chancellor's and Registrar's offices are here." },
      { id: "admissions", title: "Admissions & fee section", text: "Paperwork starts here: admissions, fee challans and your student ID are all handled in this belt of offices around the Main Block." },
      { id: "library", title: "The Central Library", text: "The National Library of Engineering Science: seating for about 400 readers and over 125,000 volumes. The book bank here is a lifesaver for textbooks." },
      { id: "lecture_halls", title: "Lecture halls", text: "Many first-year classes are held in the shared lecture complex. Check your timetable's room numbers - they're easy to mix up in week one." },
      { id: "cafeteria", title: "Cafeteria", text: "Recharge here between lectures. It gets busy right after class slots, so go a few minutes early or late." },
      { id: "mosque", title: "Campus mosque", text: "Right next to the cafeteria. Jummah prayers draw a big crowd - arrive early." },
      { id: "cricket_ground", title: "Sports ground", text: "Cricket, football and society events all happen here. Check the sports office for trials and bookings." },
      { id: "__finish__", title: "Find your department", text: "That's the core of campus! Pick your department to get a walking route from wherever you are." }
    ]
  };

  if (typeof module !== "undefined" && module.exports) module.exports = INFO;
  else root.CAMPUS_INFO = INFO;
})(typeof window !== "undefined" ? window : globalThis);
