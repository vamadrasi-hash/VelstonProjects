// Supervisor bilingual dictionary — English + Gujarati
// Add new keys here. `<L k="status" />` renders both languages.

export const SUP_LANG: Record<string, { en: string; gu: string }> = {
  // Nav
  status: { en: "Status", gu: "સ્થિતિ" },
  roster: { en: "Team", gu: "ટીમ" },
  team_today: { en: "Team Today", gu: "આજની ટીમ" },
  assign: { en: "Assign", gu: "સોંપણી" },
  photos: { en: "Photos", gu: "ફોટા" },
  tasks: { en: "Tasks", gu: "કાર્યો" },
  report: { en: "Report", gu: "રિપોર્ટ" },
  wages: { en: "Wages", gu: "વેતન" },
  work_report: { en: "Work Report", gu: "કાર્ય રિપોર્ટ" },
  carry_over_pending: { en: "Carry-over from previous days", gu: "પાછળના દિવસોના બાકી" },
  pick_replacement: { en: "Pick a replacement supervisor", gu: "બદલી સુપરવાઈઝર પસંદ કરો" },
  add_workers: { en: "Add workers", gu: "કામદારો ઉમેરો" },
  no_sites_assigned: { en: "No sites assigned to you yet.", gu: "તમને હજુ કોઈ સાઇટ સોંપાયેલી નથી." },
  today_qty: { en: "Today's qty", gu: "આજનો જથ્થો" },
  site_remark: { en: "Site remark (today)", gu: "સાઇટ ટિપ્પણી (આજે)" },
  no_workers_today: { en: "No workers selected today.", gu: "આજે કોઈ કામદાર પસંદ નથી." },

  // Buttons
  save: { en: "Save", gu: "સાચવો" },
  start_day: { en: "Start day", gu: "દિવસ શરૂ" },
  close_day: { en: "Close day", gu: "દિવસ બંધ" },
  cancel: { en: "Cancel", gu: "રદ કરો" },
  confirm: { en: "Confirm", gu: "પુષ્ટિ" },
  add: { en: "Add", gu: "ઉમેરો" },
  add_to_team: { en: "Add to team", gu: "ટીમમાં ઉમેરો" },
  remove: { en: "Remove", gu: "દૂર કરો" },
  release: { en: "Release", gu: "છૂટો" },
  release_worker: { en: "Release worker", gu: "કામદાર છૂટો કરો" },
  assign_team: { en: "Assign team", gu: "ટીમ સોંપો" },
  take_before_photo: { en: "Take 'before' photo", gu: "પહેલા નો ફોટો લો" },
  take_after_photo: { en: "Take 'after' photo", gu: "પછી નો ફોટો લો" },
  retake: { en: "Retake", gu: "ફરી લો" },
  open_map: { en: "Map", gu: "નકશો" },

  // Labels
  today: { en: "Today", gu: "આજે" },
  workers: { en: "Workers", gu: "કામદારો" },
  sites: { en: "Sites", gu: "સાઇટ" },
  site: { en: "Site", gu: "સાઇટ" },
  all_sites: { en: "All sites", gu: "બધી સાઇટ" },
  before: { en: "Before", gu: "પહેલા" },
  after: { en: "After", gu: "પછી" },
  contractor: { en: "Contractor", gu: "ઠેકેદાર" },
  designation: { en: "Designation", gu: "પદ" },
  search: { en: "Search", gu: "શોધો" },
  date: { en: "Date", gu: "તારીખ" },
  task: { en: "Task", gu: "કાર્ય" },
  qty: { en: "Quantity", gu: "જથ્થો" },
  done: { en: "Done", gu: "પૂર્ણ" },
  work_done: { en: "Work done", gu: "પૂર્ણ કરેલ કાર્ય" },
  remark: { en: "Remark", gu: "ટિપ્પણી" },
  wage: { en: "Wage", gu: "વેતન" },
  days: { en: "Days", gu: "દિવસો" },
  extra_hours: { en: "Extra hours", gu: "વધારાના કલાકો" },
  hours: { en: "Hours", gu: "કલાકો" },
  pick_supervisor: { en: "Pick a supervisor", gu: "સુપરવાઈઝર પસંદ કરો" },

  // Roster
  todays_roster: { en: "Today's roster", gu: "આજનો સ્ટાફ" },
  no_workers: { en: "No workers", gu: "કોઈ કામદાર નથી" },
  pick_workers_for_today: { en: "Pick workers for today", gu: "આજે માટે કામદારો પસંદ કરો" },
  roster_saved: { en: "Roster saved", gu: "સ્ટાફ સાચવ્યો" },
  selected: { en: "Selected", gu: "પસંદ કરેલ" },
  frozen: { en: "Frozen for today", gu: "આજે માટે ફ્રીઝ" },
  team_frozen_hint: {
    en: "Team is frozen. Use Team Today to release or set wages.",
    gu: "ટીમ ફ્રીઝ છે. છૂટો કરવા કે વેતન માટે 'આજની ટીમ' વાપરો.",
  },
  open_team_today: { en: "Open Team Today", gu: "આજની ટીમ ખોલો" },

  // Assign
  pick_site: { en: "Pick a site", gu: "સાઇટ પસંદ કરો" },
  pick_line_item: { en: "Pick a line item", gu: "કાર્ય પસંદ કરો" },
  assign_workers_from_roster: { en: "Assign workers from today's roster", gu: "આજના સ્ટાફમાંથી કામદારો સોંપો" },
  roster_empty_help: { en: "Start the day from the Team tab first.", gu: "પહેલા ટીમ ટેબ માંથી દિવસ શરૂ કરો." },
  already_busy: { en: "Already busy", gu: "પહેલેથી વ્યસ્ત" },
  assigned: { en: "Assigned", gu: "સોંપાયેલ" },
  idle: { en: "Idle", gu: "ખાલી" },
  has_active_task: { en: "Has active task — finish first", gu: "સક્રિય કાર્ય છે — પહેલા પૂરું કરો" },
  released: { en: "Released", gu: "છૂટો" },

  // Release & zero reasons
  release_reason: { en: "Reason for release", gu: "છૂટા કરવાનું કારણ" },
  zero_wage_reason: { en: "Why is wage 0?", gu: "વેતન 0 કેમ છે?" },
  zero_days_reason: { en: "Why is days 0?", gu: "દિવસો 0 કેમ છે?" },
  selected_by_mistake: { en: "Selected by mistake", gu: "ભૂલથી પસંદ" },
  absent: { en: "Absent", gu: "ગેરહાજર" },
  no_work_today: { en: "No work today", gu: "આજે કામ નથી" },
  other: { en: "Other", gu: "અન્ય" },
  reason_required: { en: "Please type a reason", gu: "કૃપા કરી કારણ લખો" },
  carry_over: { en: "Yesterday's unreleased workers", gu: "ગઈકાલના રિલીઝ ન થયેલા કામદારો" },
  unreleased_workers: {
    en: "There are unreleased workers from yesterday. Kindly release them first, only then you can select today's team members.",
    gu: "ગઈકાલના રિલીઝ ન થયેલા કામદારો છે. કૃપા કરી પહેલા તેમને રિલીઝ કરો, ત્યારે જ તમે આજની ટીમના સભ્યો પસંદ કરી શકશો.",
  },
  continue_today: { en: "Continue today", gu: "આજે ચાલુ રાખો" },
  assigned_to: { en: "Assigned to", gu: "સોંપાયેલ" },
  busy_elsewhere: { en: "Busy elsewhere", gu: "બીજે વ્યસ્ત" },
  date_of_release: { en: "Date of release", gu: "છૂટાની તારીખ" },
  todays_team: { en: "Today's team", gu: "આજની ટીમ" },
  pick_workers: { en: "Pick workers", gu: "કામદારો પસંદ કરો" },
  reason: { en: "Reason", gu: "કારણ" },
  no_task: { en: "No task assigned", gu: "કોઈ કાર્ય સોંપાયેલ નથી" },
  days_required: { en: "Days is required", gu: "દિવસો જરૂરી છે" },
  hours_required: { en: "Hours is required", gu: "કલાકો જરૂરી છે" },
  reason_required_when_zero: {
    en: "Reason is required when days and hours are both 0",
    gu: "દિવસો અને કલાકો બંને 0 હોય ત્યારે કારણ જરૂરી છે",
  },
  already_assigned: { en: "Already assigned", gu: "પહેલેથી સોંપાયેલ" },
  release_from_team_today: {
    en: "Release only from Team Today",
    gu: "ફક્ત આજની ટીમમાંથી છૂટા કરો",
  },

  // Photos
  pick_site_first: { en: "Pick a site to begin", gu: "શરૂ કરવા સાઇટ પસંદ કરો" },
  gps_live: { en: "GPS", gu: "GPS" },
  gps_acquiring: { en: "Locating…", gu: "સ્થાન શોધી રહ્યું…" },
  gps_locked: { en: "Locked", gu: "મળ્યું" },
  geo_capturing: { en: "Capturing GPS…", gu: "GPS મેળવી રહ્યું છે…" },
  geo_failed: { en: "Could not get GPS — try again", gu: "GPS મળ્યું નથી — ફરી પ્રયત્ન કરો" },
  photo_uploaded: { en: "Photo uploaded", gu: "ફોટો અપલોડ થયો" },
  upload_failed: { en: "Upload failed", gu: "અપલોડ નિષ્ફળ" },
  accuracy: { en: "accuracy", gu: "ચોકસાઈ" },
  after_photo_required: {
    en: "An 'after' photo is required to close this task today.",
    gu: "આજે આ કાર્ય બંધ કરવા 'પછી' નો ફોટો જરૂરી છે.",
  },

  // Empty states
  no_assignments: { en: "No assignments", gu: "કોઈ સોંપણી નથી" },
  no_tasks: { en: "No tasks", gu: "કોઈ કાર્ય નથી" },
  no_photos_yet: { en: "No photos yet", gu: "હજુ ફોટા નથી" },
};

export type SupKey = keyof typeof SUP_LANG;

export const t = (k: string): { en: string; gu: string } =>
  SUP_LANG[k as SupKey] || { en: k, gu: k };
