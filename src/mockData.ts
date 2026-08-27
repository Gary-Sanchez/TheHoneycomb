import { Attendee, AttendanceRecord } from "./types";

export const initialAttendees: Attendee[] = [
  {
    id: "att-1",
    name: "Elena Rostova",
    email: "elena.rostova@example.com",
    enrolledActivities: ["Speakeasy", "Music Room", "Writing Hood"],
    joinedDate: "2026-04-05",
  },
  {
    id: "att-2",
    name: "Daisuke Tanaka",
    email: "daisuke.t@example.com",
    enrolledActivities: ["Reading Club", "Writing Hood"],
    joinedDate: "2026-04-10",
  },
  {
    id: "att-3",
    name: "Amara Okafor",
    email: "amara.o@example.com",
    enrolledActivities: ["Speakeasy", "Reading Club"],
    joinedDate: "2026-04-12",
  },
  {
    id: "att-4",
    name: "Benjamin Dupont",
    email: "b.dupont@example.com",
    enrolledActivities: ["Speakeasy", "Music Room"],
    joinedDate: "2026-04-15",
  },
  {
    id: "att-5",
    name: "Hana Kimura",
    email: "hana.k@example.com",
    enrolledActivities: ["Writing Hood"],
    joinedDate: "2026-04-20",
  },
  {
    id: "att-6",
    name: "Farah Al-Saeed",
    email: "farah.as@example.com",
    enrolledActivities: ["Reading Club"],
    joinedDate: "2026-04-22",
  },
  {
    id: "att-7",
    name: "Carlos Gomez",
    email: "carlos.g@example.com",
    enrolledActivities: ["Music Room"],
    joinedDate: "2026-04-25",
  },
  {
    id: "att-8",
    name: "Gabriel Martin",
    email: "g.martin@example.com",
    enrolledActivities: ["Speakeasy"],
    joinedDate: "2026-05-01",
  },
];

// Helper to generate a sequence of weekly logs in April, May, and June 2026
const generateLogs = (): AttendanceRecord[] => {
  const logs: AttendanceRecord[] = [];
  
  // Weekly sessions on Wednesdays in Apr, May, Jun 2026
  // Wed dates:
  // April: 2026-04-08, 2026-04-15, 2026-04-22, 2026-04-29
  // May: 2026-05-06, 2026-05-13, 2026-05-20, 2026-05-27
  // June: 2026-06-03, 2026-06-10, 2026-06-17, 2026-06-24
  
  const dates = [
    "2026-04-08", "2026-04-15", "2026-04-22", "2026-04-29",
    "2026-05-06", "2026-05-13", "2026-05-20", "2026-05-27",
    "2026-06-03", "2026-06-10", "2026-06-17", "2026-06-24"
  ];

  let logIdCounter = 1;

  dates.forEach((date, dateIndex) => {
    initialAttendees.forEach(att => {
      // Only log attendance for activities the student joined *after* their join date
      if (new Date(date) < new Date(att.joinedDate)) {
        return;
      }

      att.enrolledActivities.forEach(activity => {
        // Attendance probability based on student profile
        let presentProb = 0.8;
        if (att.name === "Elena Rostova") presentProb = 0.95;
        if (att.name === "Daisuke Tanaka") presentProb = 0.95;
        if (att.name === "Gabriel Martin") presentProb = 0.55;
        if (att.name === "Carlos Gomez") presentProb = 0.65;

        // Introduce a bit of variability based on index
        const hashValue = (att.id.charCodeAt(att.id.length - 1) + dateIndex) % 10;
        const status = (hashValue / 10 < presentProb) ? "present" : "absent";

        logs.push({
          id: `log-${logIdCounter++}`,
          attendeeId: att.id,
          attendeeName: att.name,
          activity,
          date,
          status,
        });
      });
    });
  });

  return logs;
};

export const initialAttendanceRecords: AttendanceRecord[] = generateLogs();
