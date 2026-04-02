import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, where, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Course, AcademicYear, InstructorMaster, Registration } from '../types';
import { 
  Search, 
  User, 
  Building, 
  Calendar, 
  Download, 
  Loader2, 
  Filter, 
  Trash2, 
  AlertCircle, 
  X, 
  Mail, 
  Send, 
  CheckCircle2, 
  ClipboardList,
  QrCode,
  Copy,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { formatDate, formatInstructorName, formatInstructorNameSplit } from '../utils';

import { User as FirebaseUser } from 'firebase/auth';

interface Props {
  academicYears: AcademicYear[];
  courses: Course[];
  user: FirebaseUser | null;
}

export default function Registrations({ academicYears, courses, user }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [instructors, setInstructors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingRegId, setDeletingRegId] = useState<string | null>(null);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [showEvalConfirm, setShowEvalConfirm] = useState(false);
  const [excludedRecipientIds, setExcludedRecipientIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [exportType, setExportType] = useState<'all' | 'attended'>('all');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);
  const [driveLink, setDriveLink] = useState('');
  const [certSending, setCertSending] = useState(false);
  const [certSuccess, setCertSuccess] = useState(false);
  const [certProgress, setCertProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const registrationSequenceMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    const courseGroups: Record<string, Registration[]> = {};
    
    // Group by course
    registrations.forEach(reg => {
      if (!courseGroups[reg.courseId]) courseGroups[reg.courseId] = [];
      courseGroups[reg.courseId].push(reg);
    });
    
    // Sort each group by attendance timestamp (if attended) then original timestamp and assign sequence
    Object.keys(courseGroups).forEach(courseId => {
      courseGroups[courseId].sort((a, b) => {
        // If both attended, sort by attendance timestamp
        if (a.attended && b.attended) {
          const tA = a.attendanceTimestamp?.toMillis() || 0;
          const tB = b.attendanceTimestamp?.toMillis() || 0;
          if (tA !== tB) return tA - tB;
        }
        // If only one attended, that one comes first
        if (a.attended && !b.attended) return -1;
        if (!a.attended && b.attended) return 1;
        
        // If neither attended, sort by original registration timestamp
        const tA = a.timestamp?.toMillis() || 0;
        const tB = b.timestamp?.toMillis() || 0;
        if (tA !== tB) return tA - tB;
        return a.id.localeCompare(b.id); // Stable sort for same timestamp
      });
      courseGroups[courseId].forEach((reg, index) => {
        map[reg.id] = index + 1;
      });
    });
    
    return map;
  }, [registrations]);

  const handleSyncSequences = async () => {
    if (!window.confirm("คุณต้องการปรับปรุงลำดับที่ในฐานข้อมูลให้ถูกต้องตามลำดับเวลาจริงใช่หรือไม่? (การดำเนินการนี้จะอัปเดตข้อมูลทั้งหมดในหลักสูตรที่เลือก)")) return;
    
    setIsSyncing(true);
    setError(null);
    try {
      const { updateDoc, doc, writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      // We only sync for the selected course or all if 'all' is selected
      const coursesToSync = selectedCourseId === 'all' || !selectedCourseId
        ? Array.from(new Set(registrations.map(r => r.courseId)))
        : [selectedCourseId];

      for (const courseId of coursesToSync) {
        if (!courseId) continue;
        
        const courseRegs = registrations
          .filter(r => r.courseId === courseId)
          .sort((a, b) => {
            // If both attended, sort by attendance timestamp
            if (a.attended && b.attended) {
              const tA = a.attendanceTimestamp?.toMillis() || 0;
              const tB = b.attendanceTimestamp?.toMillis() || 0;
              if (tA !== tB) return tA - tB;
            }
            // If only one attended, that one comes first
            if (a.attended && !b.attended) return -1;
            if (!a.attended && b.attended) return 1;
            
            // If neither attended, sort by original registration timestamp
            const tA = a.timestamp?.toMillis() || 0;
            const tB = b.timestamp?.toMillis() || 0;
            if (tA !== tB) return tA - tB;
            return a.id.localeCompare(b.id);
          });

        courseRegs.forEach((reg, index) => {
          const newSeq = index + 1;
          if (reg.sequenceNumber !== newSeq) {
            batch.update(doc(db, 'registrations', reg.id), { sequenceNumber: newSeq });
          }
        });

        // Update course registrationCount
        batch.update(doc(db, 'courses', courseId), { registrationCount: courseRegs.length });
      }

      await batch.commit();
      alert("ปรับปรุงลำดับที่เรียบร้อยแล้ว");
    } catch (err: any) {
      console.error("Error syncing sequences:", err);
      setError("เกิดข้อผิดพลาดในการปรับปรุงลำดับที่: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getAttendanceLink = (courseId: string) => {
    return `${window.location.origin}/?view=attendance&courseId=${courseId}`;
  };

  const handleDeleteRegistration = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'registrations', id));
      setDeletingRegId(null);
    } catch (error) {
      console.error("Error deleting registration:", error);
      setError("เกิดข้อผิดพลาดในการลบข้อมูล");
      setDeletingRegId(null);
    }
  };

  const handleSendReminder = () => {
    if (!selectedCourseId || selectedCourseId === 'all') return;
    
    const course = courses.find(c => c.id === selectedCourseId);
    if (!course) return;

    const recipients = filteredRegistrations
      .map(reg => ({
        email: reg.instructorEmail || instructors[reg.instructorId],
        name: reg.instructorName
      }))
      .filter(r => r.email);

    if (recipients.length === 0) {
      setError("ไม่พบอีเมลของผู้ลงทะเบียนในหลักสูตรนี้");
      return;
    }

    setExcludedRecipientIds(new Set());
    setShowEmailConfirm(true);
  };

  const handleSendEvaluation = () => {
    if (!selectedCourseId || selectedCourseId === 'all') return;
    
    const course = courses.find(c => c.id === selectedCourseId);
    if (!course) return;

    const recipients = filteredRegistrations
      .filter(reg => reg.attended)
      .map(reg => ({
        email: reg.instructorEmail || instructors[reg.instructorId],
        name: reg.instructorName
      }))
      .filter(r => r.email);

    if (recipients.length === 0) {
      setError("ไม่พบผู้ที่มาอบรมจริงที่มีอีเมลในหลักสูตรนี้");
      return;
    }

    setExcludedRecipientIds(new Set());
    setShowEvalConfirm(true);
  };

  const toggleRecipient = (id: string) => {
    setExcludedRecipientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const confirmSendReminder = async () => {
    const course = courses.find(c => c.id === selectedCourseId);
    if (!course) return;

    const recipients = filteredRegistrations
      .filter(reg => !excludedRecipientIds.has(reg.id))
      .map(reg => ({
        email: reg.instructorEmail || instructors[reg.instructorId],
        name: reg.instructorName
      }))
      .filter(r => r.email);

    if (recipients.length === 0) {
      setError("กรุณาเลือกผู้รับอย่างน้อย 1 ท่าน");
      return;
    }

    setSendingEmail(true);
    setError(null);
    setShowEmailConfirm(false);

    try {
      const response = await fetch('/api/email/send-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipients,
          courseTitle: course.title,
          courseDate: formatDate(course.date),
          startTime: course.startTime,
          endTime: course.endTime,
          courseRoom: course.room
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send emails');

      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 5000);
    } catch (err: any) {
      console.error('Error sending reminders:', err);
      setError(err.message || "เกิดข้อผิดพลาดในการส่งอีเมล");
    } finally {
      setSendingEmail(false);
    }
  };

  const confirmSendEvaluation = async () => {
    const course = courses.find(c => c.id === selectedCourseId);
    if (!course) return;

    const recipients = filteredRegistrations
      .filter(reg => reg.attended && !excludedRecipientIds.has(reg.id))
      .map(reg => ({
        email: reg.instructorEmail || instructors[reg.instructorId],
        name: reg.instructorName
      }))
      .filter(r => r.email);

    if (recipients.length === 0) {
      setError("กรุณาเลือกผู้รับอย่างน้อย 1 ท่าน");
      return;
    }

    setSendingEmail(true);
    setError(null);
    setShowEvalConfirm(false);

    try {
      const response = await fetch('/api/email/send-evaluation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId: selectedCourseId,
          courseTitle: course.title,
          recipients
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send emails');

      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 5000);
    } catch (err: any) {
      console.error('Error sending evaluations:', err);
      setError(err.message || "เกิดข้อผิดพลาดในการส่งอีเมล");
    } finally {
      setSendingEmail(false);
    }
  };

  useEffect(() => {
    // Fetch instructors to lookup emails for existing registrations
    const fetchInstructors = async () => {
      try {
        const snap = await getDocs(collection(db, 'instructors_master'));
        const instructorMap: Record<string, string> = {};
        snap.docs.forEach(doc => {
          const data = doc.data() as InstructorMaster;
          instructorMap[data.instructorId] = data.email;
        });
        setInstructors(instructorMap);
      } catch (err) {
        console.error("Error fetching instructors:", err);
      }
    };
    fetchInstructors();

    const q = query(collection(db, 'registrations'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Registration)));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching registrations:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const filteredRegistrations = registrations
    .filter(reg => {
      if (!selectedCourseId) return false;
      const matchesCourse = selectedCourseId === 'all' || reg.courseId === selectedCourseId;
      const matchesSearch = reg.instructorName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           reg.instructorId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           reg.department.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesAttendance = exportType === 'all' || reg.attended;
      
      return matchesCourse && matchesSearch && matchesAttendance;
    })
    .sort((a, b) => {
      if (exportType === 'attended') {
        const tA = a.attendanceTimestamp?.toMillis() || 0;
        const tB = b.attendanceTimestamp?.toMillis() || 0;
        if (tA !== tB) return tA - tB;
        return a.id.localeCompare(b.id);
      } else {
        const tA = a.timestamp?.toMillis() || 0;
        const tB = b.timestamp?.toMillis() || 0;
        if (tA !== tB) return tA - tB;
        return a.id.localeCompare(b.id);
      }
    });

  const certificateRecipients = React.useMemo(() => {
    return filteredRegistrations
      .filter(r => r.attended)
      .sort((a, b) => {
        const tA = a.attendanceTimestamp?.toMillis() || 0;
        const tB = b.attendanceTimestamp?.toMillis() || 0;
        return tA - tB;
      });
  }, [filteredRegistrations]);

  const handleSendCertificates = async () => {
    if (!driveLink) {
      setError("กรุณาใส่ลิงก์ Google Drive");
      return;
    }

    const course = courses.find(c => c.id === selectedCourseId);
    if (!course) return;

    setCertSending(true);
    setCertProgress(0);
    setError(null);

    try {
      // Simulate progress since backend sends all at once
      const total = certificateRecipients.length;
      const progressInterval = setInterval(() => {
        setCertProgress(prev => {
          if (prev >= 90) return prev;
          return prev + (100 / (total * 2)); // Slow progress
        });
      }, 500);

      const response = await fetch('/api/certificates/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId: selectedCourseId,
          courseTitle: course.title,
          driveLink,
          attendees: certificateRecipients.map((reg, index) => ({
            email: reg.instructorEmail || instructors[reg.instructorId],
            name: reg.instructorName,
            fileName: `${index + 1}.png`
          }))
        }),
      });

      clearInterval(progressInterval);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send certificates');

      setCertProgress(100);
      if (data.errorCount > 0) {
        setError(`ส่งสำเร็จ ${data.count} รายการ, ผิดพลาด ${data.errorCount} รายการ`);
        // We still show success but with a warning
        setCertSuccess(true);
      } else {
        setCertSuccess(true);
      }
      setCertSending(false);
      // Don't close modal automatically, let user see success message
    } catch (err: any) {
      console.error('Error sending certificates:', err);
      setError(err.message || "เกิดข้อผิดพลาดในการส่งใบประกาศ");
      setCertSending(false);
    } finally {
      // We keep certSending true until user closes or we show success
    }
  };

  const exportToCSV = () => {
    const headers = ['Instructor ID', 'Name', 'Position', 'Department', 'Course', 'Date Registered', 'Email', 'Attendance Status', 'Attendance Time'];
    
    const dataToExport = exportType === 'all' 
      ? filteredRegistrations 
      : filteredRegistrations.filter(r => r.attended);

    const rows = dataToExport.map(reg => {
      const course = courses.find(c => c.id === reg.courseId);
      return [
        reg.instructorId,
        formatInstructorName(reg.instructorName),
        reg.instructorPosition || '-',
        reg.department,
        course ? `${course.title} (${course.startTime}-${course.endTime})` : 'Unknown Course',
        reg.timestamp?.toDate().toLocaleString('th-TH') || '-',
        reg.instructorEmail || '-',
        reg.attended ? 'มาอบรมจริง' : 'ลงทะเบียนล่วงหน้า',
        reg.attendanceTimestamp?.toDate().toLocaleString('th-TH') || '-'
      ];
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${exportType === 'all' ? 'registrations' : 'attendance'}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <AnimatePresence>
        {showQrModal && selectedCourseId && selectedCourseId !== 'all' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-primary p-8 text-white relative">
                <button 
                  onClick={() => setShowQrModal(false)}
                  className="absolute top-6 right-6 text-white/60 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Attendance QR Link</span>
                </div>
                <h3 className="text-xl font-bold serif">ลิงก์เช็คอินสำหรับหลักสูตร</h3>
                <p className="text-xs mt-2 opacity-80 truncate">
                  {courses.find(c => c.id === selectedCourseId)?.title}
                </p>
              </div>

              <div className="p-8">
                <div className="bg-gray-50 rounded-2xl p-6 mb-6 text-center">
                  <div className="w-48 h-48 bg-white rounded-2xl shadow-sm mx-auto mb-6 flex items-center justify-center border border-gray-100 p-4">
                    <QRCodeSVG 
                      value={getAttendanceLink(selectedCourseId)} 
                      size={160}
                      level="H"
                      includeMargin={false}
                      imageSettings={{
                        src: "https://www.bu.ac.th/favicon.ico",
                        x: undefined,
                        y: undefined,
                        height: 24,
                        width: 24,
                        excavate: true,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mb-4 break-all font-mono">
                    {getAttendanceLink(selectedCourseId)}
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleCopyLink(getAttendanceLink(selectedCourseId))}
                      className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-200 py-3 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all"
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                    </button>
                    <a 
                      href={getAttendanceLink(selectedCourseId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10"
                    >
                      <ExternalLink className="w-4 h-4" />
                      เปิดลิงก์
                    </a>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                  สแกน QR Code เพื่อเข้าสู่หน้าเช็คอินสำหรับหลักสูตรนี้<br/>
                  หรือส่งลิงก์ให้ผู้เข้าอบรมผ่านช่องทางต่างๆ
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 serif mb-2">รายชื่อผู้ลงทะเบียน</h1>
          <p className="text-gray-500">ตรวจสอบและจัดการรายชื่ออาจารย์ที่สมัครเข้าร่วมอบรม</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setShowCertModal(true)}
            disabled={!selectedCourseId || selectedCourseId === 'all' || filteredRegistrations.length === 0 || certSending}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all ${
              !selectedCourseId || selectedCourseId === 'all' || filteredRegistrations.length === 0 || certSending
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : certSuccess 
                  ? 'bg-green-500 text-white shadow-green-200'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
            }`}
          >
            {certSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : certSuccess ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <ClipboardList className="w-5 h-5" />
            )}
            {certSending ? 'กำลังส่ง...' : certSuccess ? 'ส่งสำเร็จ' : 'ส่งใบ Certificate'}
          </button>
          <button 
            onClick={handleSendReminder}
            disabled={!selectedCourseId || selectedCourseId === 'all' || filteredRegistrations.length === 0 || sendingEmail}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all ${
              !selectedCourseId || selectedCourseId === 'all' || filteredRegistrations.length === 0 || sendingEmail
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : emailSuccess 
                  ? 'bg-green-500 text-white shadow-green-200'
                  : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'
            }`}
          >
            {sendingEmail ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : emailSuccess ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Mail className="w-5 h-5" />
            )}
            {sendingEmail ? 'กำลังส่ง...' : emailSuccess ? 'ส่งสำเร็จ' : 'ส่งอีเมลแจ้งเตือน'}
          </button>
          <button 
            onClick={handleSendEvaluation}
            disabled={!selectedCourseId || selectedCourseId === 'all' || filteredRegistrations.length === 0 || sendingEmail}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all ${
              !selectedCourseId || selectedCourseId === 'all' || filteredRegistrations.length === 0 || sendingEmail
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : emailSuccess 
                  ? 'bg-green-500 text-white shadow-green-200'
                  : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'
            }`}
          >
            {sendingEmail ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : emailSuccess ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <ClipboardList className="w-5 h-5" />
            )}
            {sendingEmail ? 'กำลังส่ง...' : emailSuccess ? 'ส่งสำเร็จ' : 'ส่งแบบประเมินผล'}
          </button>
          
          <div className="flex bg-white rounded-xl border border-gray-100 p-1 shadow-sm">
            <button 
              onClick={() => setExportType('all')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${exportType === 'all' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
            >
              ทั้งหมด
            </button>
            <button 
              onClick={() => setExportType('attended')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${exportType === 'attended' ? 'bg-green-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
            >
              มาอบรมจริง
            </button>
          </div>

          <button 
            onClick={exportToCSV}
            disabled={!selectedCourseId || filteredRegistrations.length === 0}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all ${
              !selectedCourseId || filteredRegistrations.length === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : exportType === 'all' 
                  ? 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'
                  : 'bg-green-600 text-white hover:bg-green-700 shadow-green-200'
            }`}
          >
            <Download className="w-5 h-5" />
            ส่งออก {exportType === 'all' ? 'รายชื่อสมัคร' : 'รายชื่อมาจริง'} (CSV)
          </button>
          <button 
            onClick={handleSyncSequences}
            disabled={!selectedCourseId || filteredRegistrations.length === 0 || isSyncing}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all ${
              !selectedCourseId || filteredRegistrations.length === 0 || isSyncing
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-200'
            }`}
            title="ปรับปรุงลำดับที่ให้ถูกต้องตามเวลาจริง"
          >
            {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ClipboardList className="w-5 h-5" />}
            {isSyncing ? 'กำลังปรับปรุง...' : 'ปรับปรุงลำดับที่'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {emailSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-green-800">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">ส่งอีเมลแจ้งเตือนไปยังผู้ลงทะเบียนเรียบร้อยแล้ว</p>
        </div>
      )}

      {certSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-green-800">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">ส่งใบ Certificate เรียบร้อยแล้ว</p>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="ค้นหาชื่อ, รหัส หรือหน่วยงาน..."
              className="w-full bg-gray-50 border-none rounded-xl p-3 pl-12 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="relative w-full md:w-64">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select 
              className="w-full bg-gray-50 border-none rounded-xl p-3 pl-12 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm appearance-none transition-all"
              value={selectedCourseId}
              onChange={e => setSelectedCourseId(e.target.value)}
            >
              <option value="">-- กรุณาเลือกหลักสูตร --</option>
              <option value="all">ทุกหลักสูตร</option>
              {courses.map(course => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </select>
          </div>

          {selectedCourseId && selectedCourseId !== 'all' && (
            <button 
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-all shadow-sm whitespace-nowrap"
              title="สร้างลิงก์เช็คอิน (QR Code)"
            >
              <QrCode className="w-4 h-4" />
              ลิงก์เช็คอิน
            </button>
          )}

          <div className="flex items-center justify-end text-xs text-gray-400 font-bold uppercase tracking-widest ml-auto">
            พบ {filteredRegistrations.length} รายการ
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ลำดับ</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">รหัสอาจารย์</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ชื่อ-นามสกุล</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">หน่วยงาน</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">อีเมล</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">หลักสูตรที่สมัคร</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                  </td>
                </tr>
              ) : !selectedCourseId ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Filter className="w-12 h-12 opacity-20" />
                      <p className="font-bold serif text-lg">กรุณาเลือกหลักสูตรเพื่อดูรายชื่อ</p>
                      <p className="text-xs uppercase tracking-widest">เลือกจากเมนู "กรองตามหลักสูตร" ด้านบน</p>
                    </div>
                  </td>
                </tr>
              ) : filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">
                    ไม่พบข้อมูลการลงทะเบียนในหลักสูตรนี้
                  </td>
                </tr>
              ) : (
                  filteredRegistrations.map((reg, index) => {
                    const course = courses.find(c => c.id === reg.courseId);
                    const displaySequence = exportType === 'attended' 
                      ? (index + 1) 
                      : (registrationSequenceMap[reg.id] || reg.sequenceNumber || '-');
                    
                    return (
                      <tr key={reg.id} className="hover:bg-gray-50 transition-colors group relative">
                        {reg.attended && (
                          <div className="absolute inset-y-0 left-0 w-1.5 bg-green-500 z-10" title="มาอบรมจริง" />
                        )}
                        <td className={`px-6 py-4 ${reg.attended ? 'bg-green-50/30' : ''}`}>
                          <div className="flex flex-col items-center">
                            <span className={`text-lg font-black leading-none ${
                              exportType === 'all' && registrationSequenceMap[reg.id] !== reg.sequenceNumber 
                                ? 'text-orange-500' 
                                : reg.attended ? 'text-green-600' : 'text-primary'
                            }`}>
                              {displaySequence}
                            </span>
                            <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">ลำดับที่</span>
                            {exportType === 'all' && registrationSequenceMap[reg.id] !== reg.sequenceNumber && (
                              <span className="text-[8px] text-orange-400 font-medium mt-0.5">(ไม่ตรงกับ DB)</span>
                            )}
                          </div>
                        </td>
                        <td className={`px-6 py-4 ${reg.attended ? 'bg-green-50/30' : ''}`}>
                          <span className="font-mono text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">
                            {reg.instructorId}
                          </span>
                        </td>
                        <td className={`px-6 py-4 ${reg.attended ? 'bg-green-50/30' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${reg.attended ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary'}`}>
                              <User className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col min-w-[150px]">
                              <span className={`text-sm font-bold leading-tight whitespace-nowrap ${reg.attended ? 'text-green-900' : 'text-gray-900'}`}>
                                {formatInstructorNameSplit(reg.instructorName)[0]}
                              </span>
                              <span className={`text-sm font-bold leading-tight whitespace-nowrap ${reg.attended ? 'text-green-900' : 'text-gray-900'}`}>
                                {formatInstructorNameSplit(reg.instructorName)[1]}
                              </span>
                              {reg.instructorPosition && (
                                <span className="text-[10px] text-gray-400 font-medium mt-1">{reg.instructorPosition}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={`px-6 py-4 ${reg.attended ? 'bg-green-50/30' : ''}`}>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Building className="w-3.5 h-3.5" />
                            <span className="text-xs">{reg.department}</span>
                          </div>
                        </td>
                        <td className={`px-6 py-4 ${reg.attended ? 'bg-green-50/30' : ''}`}>
                          <div className="flex items-center gap-2 text-gray-500">
                            <Mail className="w-3.5 h-3.5" />
                            <span className="text-xs">{reg.instructorEmail || instructors[reg.instructorId] || '-'}</span>
                          </div>
                        </td>
                        <td className={`px-6 py-4 ${reg.attended ? 'bg-green-50/30' : ''}`}>
                          <div className="max-w-[250px]">
                            <p className="text-sm font-bold text-gray-900 leading-snug">{course?.title || 'Unknown Course'}</p>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase">
                              <span>{course ? formatDate(course.date) : '-'}</span>
                              {course && (
                                <span className="bg-primary/10 px-1 rounded text-primary">
                                  {course.startTime}-{course.endTime}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={`px-6 py-4 ${reg.attended ? 'bg-green-50/30' : ''}`}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-gray-500">
                              <Calendar className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold">สมัคร:</span>
                              <span className="text-[10px]">
                                {reg.timestamp?.toDate().toLocaleDateString('th-TH', { 
                                  day: '2-digit', 
                                  month: 'short', 
                                  year: '2-digit'
                                })}
                              </span>
                            </div>
                            {reg.attended && (
                              <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold">มาจริง:</span>
                                <span className="text-[10px]">
                                  {reg.attendanceTimestamp?.toDate().toLocaleDateString('th-TH', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    year: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className={`px-6 py-4 text-right ${reg.attended ? 'bg-green-50/30' : ''}`}>
                          <button 
                            onClick={() => setDeletingRegId(reg.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="ลบรายชื่อ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Certificate Modal */}
      <AnimatePresence>
        {showCertModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 p-8 text-white relative">
                <button 
                  onClick={() => {
                    setShowCertModal(false);
                    setCertSuccess(false);
                    setCertSending(false);
                    setCertProgress(0);
                  }}
                  className="absolute top-6 right-6 text-white/60 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Certificate Distribution</span>
                </div>
                <h3 className="text-2xl font-bold serif">ส่งใบ Certificate</h3>
                <p className="text-sm mt-2 opacity-80">
                  {courses.find(c => c.id === selectedCourseId)?.title}
                </p>
              </div>

              <div className="p-8">
                {certSuccess ? (
                  <div className="py-12 text-center">
                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2 serif">ส่ง Certificate เรียบร้อย</h3>
                    <p className="text-gray-500 mb-8">ระบบได้ดำเนินการส่งอีเมลพร้อมใบประกาศนียบัตรให้ผู้เข้าร่วมอบรมครบถ้วนแล้ว</p>
                    <button 
                      onClick={() => {
                        setShowCertModal(false);
                        setCertSuccess(false);
                        setCertSending(false);
                        setCertProgress(0);
                      }}
                      className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                    >
                      ปิดหน้าต่าง
                    </button>
                  </div>
                ) : certSending ? (
                  <div className="py-12 text-center">
                    <div className="mb-8">
                      <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                      <h4 className="font-bold text-gray-900 text-lg mb-2 serif">กำลังดำเนินการส่ง...</h4>
                      <p className="text-sm text-gray-500">กรุณารอสักครู่ ระบบกำลังจัดส่งอีเมลพร้อมไฟล์ใบประกาศ</p>
                    </div>
                    
                    <div className="max-w-md mx-auto">
                      <div className="flex justify-between text-xs font-bold text-gray-400 uppercase mb-2">
                        <span>Progress</span>
                        <span>{Math.round(certProgress)}%</span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-indigo-600"
                          initial={{ width: 0 }}
                          animate={{ width: `${certProgress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-6">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Google Drive Folder Link</label>
                      <div className="relative">
                        <ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input 
                          type="text" 
                          placeholder="วางลิงก์โฟลเดอร์ Google Drive ที่นี่..."
                          className="w-full bg-gray-50 border-none rounded-xl p-4 pl-12 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all"
                          value={driveLink}
                          onChange={e => setDriveLink(e.target.value)}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-2 italic">
                        * ตรวจสอบให้แน่ใจว่าโฟลเดอร์ตั้งค่าเป็น "ทุกคนที่มีลิงก์สามารถอ่านได้" (Anyone with the link can view)
                      </p>
                    </div>

                    <div className="mb-8">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-gray-900 serif">รายการตรวจสอบ (Preview)</h4>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full uppercase">
                          {certificateRecipients.length} ท่าน
                        </span>
                      </div>
                      <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-2xl">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-gray-50 z-10">
                            <tr>
                              <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ลำดับ</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ชื่อ-นามสกุล</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ไฟล์ที่จับคู่</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {certificateRecipients.map((reg, index) => (
                              <tr key={reg.id} className="text-sm">
                                <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-bold">{index + 1}</td>
                                <td className="px-4 py-3 font-medium text-gray-700">{reg.instructorName}</td>
                                <td className="px-4 py-3">
                                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-mono">
                                    {index + 1}.png
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={() => setShowCertModal(false)}
                        className="flex-1 py-4 border border-gray-200 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 transition-all"
                      >
                        ยกเลิก
                      </button>
                      <button 
                        onClick={handleSendCertificates}
                        disabled={certSending || !driveLink}
                        className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white shadow-lg transition-all ${
                          certSending || !driveLink
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                            : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                        }`}
                      >
                        <Send className="w-5 h-5" />
                        ยืนยันการส่งใบประกาศ
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingRegId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-600 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2 serif">ยืนยันการลบรายชื่อ</h3>
              <p className="text-gray-500 mb-8 text-sm">
                คุณต้องการลบรายชื่อของ <span className="font-bold text-gray-900">{registrations.find(r => r.id === deletingRegId)?.instructorName}</span> ออกจากหลักสูตรนี้ใช่หรือไม่?
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingRegId(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={() => handleDeleteRegistration(deletingRegId)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-md hover:bg-red-700"
                >
                  ยืนยันการลบ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Email Confirmation Modal */}
      <AnimatePresence>
        {showEmailConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-red-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 serif leading-none">ยืนยันการส่งอีเมลแจ้งเตือน</h3>
                    <p className="text-xs text-red-600 font-bold uppercase tracking-widest mt-1">ส่งอีเมลแจ้งเตือนไปยังผู้ลงทะเบียน</p>
                  </div>
                </div>
                <button onClick={() => setShowEmailConfirm(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                <div className="mb-6 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">หลักสูตร</p>
                  <h4 className="text-lg font-bold text-gray-900 serif">
                    {courses.find(c => c.id === selectedCourseId)?.title}
                  </h4>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(courses.find(c => c.id === selectedCourseId)?.date!)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4" />
                      <span>{courses.find(c => c.id === selectedCourseId)?.startTime} - {courses.find(c => c.id === selectedCourseId)?.endTime} น.</span>
                    </div>
                  </div>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    รายชื่อผู้รับ ({filteredRegistrations.length - excludedRecipientIds.size} จาก {filteredRegistrations.length} ท่าน)
                  </p>
                </div>
                
                <div className="border border-gray-100 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ชื่อ-นามสกุล</th>
                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">อีเมล</th>
                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredRegistrations.map((reg) => {
                        const isExcluded = excludedRecipientIds.has(reg.id);
                        return (
                          <tr key={reg.id} className={isExcluded ? 'bg-gray-50 opacity-50' : ''}>
                            <td className={`px-4 py-2 text-sm font-medium ${isExcluded ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                              {reg.instructorName}
                            </td>
                            <td className={`px-4 py-2 text-sm font-mono ${isExcluded ? 'text-gray-400' : 'text-gray-500'}`}>
                              {reg.instructorEmail || instructors[reg.instructorId] || <span className="text-red-400 italic">ไม่พบอีเมล</span>}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button 
                                onClick={() => toggleRecipient(reg.id)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isExcluded 
                                    ? 'text-green-600 hover:bg-green-50' 
                                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                }`}
                                title={isExcluded ? "เพิ่มกลับ" : "นำออกจากการส่ง"}
                              >
                                {isExcluded ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                <button 
                  onClick={() => setShowEmailConfirm(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-white transition-colors"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={confirmSendReminder}
                  disabled={sendingEmail}
                  className="flex-2 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                >
                  {sendingEmail ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                  {sendingEmail ? 'กำลังส่งอีเมล...' : 'ยืนยันการส่งอีเมล'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Evaluation Confirmation Modal */}
      <AnimatePresence>
        {showEvalConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-primary/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 serif leading-none">ยืนยันการส่งแบบประเมินผล</h3>
                    <p className="text-xs text-primary font-bold uppercase tracking-widest mt-1">ส่ง Link แบบประเมินรายบุคคล</p>
                  </div>
                </div>
                <button onClick={() => setShowEvalConfirm(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                <div className="mb-6 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">หลักสูตร</p>
                  <h4 className="text-lg font-bold text-gray-900 serif">
                    {courses.find(c => c.id === selectedCourseId)?.title}
                  </h4>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    รายชื่อผู้รับ ({filteredRegistrations.length - excludedRecipientIds.size} จาก {filteredRegistrations.length} ท่าน)
                  </p>
                </div>
                
                <div className="border border-gray-100 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ชื่อ-นามสกุล</th>
                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">อีเมล</th>
                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredRegistrations.map((reg) => {
                        const isExcluded = excludedRecipientIds.has(reg.id);
                        return (
                          <tr key={reg.id} className={isExcluded ? 'bg-gray-50 opacity-50' : ''}>
                            <td className={`px-4 py-2 text-sm font-medium ${isExcluded ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                              {reg.instructorName}
                            </td>
                            <td className={`px-4 py-2 text-sm font-mono ${isExcluded ? 'text-gray-400' : 'text-gray-500'}`}>
                              {reg.instructorEmail || instructors[reg.instructorId] || <span className="text-red-400 italic">ไม่พบอีเมล</span>}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button 
                                onClick={() => toggleRecipient(reg.id)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isExcluded 
                                    ? 'text-green-600 hover:bg-green-50' 
                                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                }`}
                                title={isExcluded ? "เพิ่มกลับ" : "นำออกจากการส่ง"}
                              >
                                {isExcluded ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                <button 
                  onClick={() => setShowEvalConfirm(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-white transition-colors"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={confirmSendEvaluation}
                  disabled={sendingEmail}
                  className="flex-2 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                >
                  {sendingEmail ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                  {sendingEmail ? 'กำลังส่งอีเมล...' : 'ยืนยันการส่งแบบประเมิน'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
