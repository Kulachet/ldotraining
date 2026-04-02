import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, Timestamp } from 'firebase/firestore';
import { db, databaseId } from '../firebase';
import { AcademicYear, Course, Registration } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { Users, BookOpen, Calendar, Printer, FileText, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { formatDate } from '../utils';
import { User } from 'firebase/auth';

interface Props {
  academicYears: AcademicYear[];
  courses: Course[];
  user: User | null;
}

export default function Dashboard({ academicYears, courses, user }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'registrations'),
      (snap) => {
        setRegistrations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Registration)));
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching registrations:', error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  const seedDemoData = async () => {
    if (!user) return;
    setIsSeeding(true);

    try {
      const yearRef = await addDoc(collection(db, 'academic_years'), {
        year: '2568',
        status: 'active',
      });

      const sampleCourses = [
        {
          title: 'การใช้ AI ในการจัดการเรียนการสอน (Generative AI for Educators)',
          academicYearId: yearRef.id,
          date: Timestamp.fromDate(new Date('2026-05-15')),
          startTime: '09:00',
          endTime: '16:00',
          speaker: 'ดร.สมชาย ใจดี',
          description: 'เรียนรู้การใช้ ChatGPT และ Gemini ในการสร้างสื่อการสอน',
          maxParticipants: 50,
          room: 'A3-201',
          published: true,
          registrationCount: 0,
        },
        {
          title: 'เทคนิคการออกแบบสื่อการสอนด้วย Canva',
          academicYearId: yearRef.id,
          date: Timestamp.fromDate(new Date('2026-06-10')),
          startTime: '13:00',
          endTime: '16:00',
          speaker: 'อ.วิภาวรรณ รักเรียน',
          description: 'Workshop การออกแบบ Infographic และ Presentation',
          maxParticipants: 40,
          room: 'Online (Zoom)',
          published: true,
          registrationCount: 0,
        },
      ];

      for (const course of sampleCourses) {
        await addDoc(collection(db, 'courses'), course);
      }
    } catch (err) {
      console.error(err);
      alert(
        'เกิดข้อผิดพลาดในการสร้างข้อมูลตัวอย่าง: ' +
          (err instanceof Error ? err.message : '')
      );
    } finally {
      setIsSeeding(false);
    }
  };

  const activeYearIds = academicYears
    .filter((y) => y.status === 'active')
    .map((y) => y.id);

  const activeCoursesList = courses.filter(
    (c) => activeYearIds.includes(c.academicYearId) && c.published === true
  );

  const statsByCourse = courses.map((course) => {
    const count = registrations.filter((r) => r.courseId === course.id).length;
    return {
      name: course.title.length > 20 ? `${course.title.substring(0, 20)}...` : course.title,
      fullName: course.title,
      count,
      capacity: course.maxParticipants,
    };
  });

  const statsByYear = academicYears.map((year) => {
    const count = registrations.filter((r) => r.academicYearId === year.id).length;
    return {
      name: year.year,
      count,
    };
  });

  const totalRegistrations = registrations.length;
  const activeCourses = activeCoursesList.length;
  const currentAcademicYear = academicYears.find((y) => y.status === 'active')?.year || '-';
  const isEmpty = academicYears.length === 0 && courses.length === 0;

  const handlePrint = () => {
    window.print();
  };

  const COLORS = ['#E12D2D', '#F15A24', '#8E9299', '#1a1a1a', '#F27D26'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto print:p-0">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 serif mb-2">แดชบอร์ดสรุปผล</h1>
          <p className="text-gray-500">ภาพรวมการลงทะเบียนอบรมวิชาการ</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            พิมพ์รายงาน
          </button>
        </div>
      </div>

      {!user && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-800">
          <Users className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm">คุณยังไม่ได้เข้าสู่ระบบด้วย Google</p>
            <p className="text-[10px] opacity-70 mt-1">
              ข้อมูล "จำนวนผู้ลงทะเบียน" จะไม่แสดงหากคุณไม่ได้เข้าสู่ระบบด้วย Google
              เพื่อยืนยันสิทธิ์การเข้าถึงข้อมูลส่วนบุคคล
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2 items-center text-xs font-mono bg-gray-50 p-3 rounded-xl border border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-gray-500">Connected:</span>
        </div>
        <span className="bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700">
          Project: {db.app.options.projectId}
        </span>
        <span className="bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700">
          Database: {databaseId}
        </span>
        {user && (
          <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">
            User: {user.email}
          </span>
        )}
      </div>

      {isEmpty && (
        <div className="bg-amber-50 border border-amber-100 p-8 rounded-3xl text-center">
          <BookOpen className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-amber-900 mb-2">ไม่พบข้อมูลในระบบ</h3>
          <p className="text-sm text-amber-700 mb-6 max-w-md mx-auto">
            หากคุณเพิ่งทำการ Remix แอป หรือเพิ่งเริ่มใช้งานครั้งแรก ฐานข้อมูลจะยังว่างเปล่า
            คุณสามารถเริ่มสร้างข้อมูลเองได้ที่เมนู "จัดการหลักสูตร"
            หรือใช้ปุ่มด้านล่างเพื่อสร้างข้อมูลตัวอย่าง
          </p>
          <button
            onClick={seedDemoData}
            disabled={isSeeding}
            className="inline-flex items-center gap-2 bg-amber-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 disabled:opacity-50"
          >
            {isSeeding ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                กำลังสร้างข้อมูล...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                สร้างข้อมูลตัวอย่าง (Seed Demo Data)
              </>
            )}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={<Users className="w-6 h-6 text-primary" />}
          label="จำนวนผู้ลงทะเบียนทั้งหมด"
          value={totalRegistrations}
          subLabel="คน"
        />
        <StatCard
          icon={<BookOpen className="w-6 h-6 text-primary" />}
          label="หลักสูตรที่เปิดรับ (Active)"
          value={activeCourses}
          subLabel="หลักสูตร"
        />
        <StatCard
          icon={<Calendar className="w-6 h-6 text-primary" />}
          label="ปีการศึกษาปัจจุบัน"
          value={currentAcademicYear}
          subLabel=""
        />
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 print:hidden">
        <h3 className="font-bold serif mb-6 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          สรุปจำนวนที่นั่งคงเหลือ (Active Courses)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  หลักสูตร
                </th>
                <th className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">
                  ลงทะเบียนแล้ว
                </th>
                <th className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">
                  รับทั้งหมด
                </th>
                <th className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">
                  คงเหลือ
                </th>
                <th className="py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">
                  สถานะ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activeCoursesList.map((course) => {
                const count = registrations.filter((r) => r.courseId === course.id).length;
                const remaining = Math.max(0, course.maxParticipants - count);
                const isFull = remaining <= 0;

                return (
                  <tr key={course.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4">
                      <p className="text-sm font-bold text-gray-900">{course.title}</p>
                      <p className="text-[10px] text-gray-400 uppercase">{formatDate(course.date)}</p>
                    </td>
                    <td className="py-4 text-center font-bold text-gray-700">{count}</td>
                    <td className="py-4 text-center text-gray-500">{course.maxParticipants}</td>
                    <td className="py-4 text-center">
                      <span
                        className={`font-black ${
                          remaining <= 5 ? 'text-red-500' : 'text-green-600'
                        }`}
                      >
                        {remaining}
                      </span>
                    </td>
                    <td className="py-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                          isFull ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                        }`}
                      >
                        {isFull ? 'เต็มแล้ว' : 'เปิดรับ'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="font-bold serif mb-6 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            จำนวนผู้ลงทะเบียนรายหลักสูตร
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statsByCourse} layout="vertical" margin={{ left: 40, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={150}
                  tick={{ fontSize: 10, fill: '#888' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: '#f5f5f0' }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {statsByCourse.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="font-bold serif mb-6 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            สถิติการลงทะเบียนรายปีการศึกษา
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statsByYear}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="count"
                >
                  {statsByYear.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {statsByYear.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-xs text-gray-500 font-medium">
                  ปี {entry.name} ({entry.count})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden print:block">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold serif">รายงานสรุปผลการลงทะเบียนอบรมวิชาการ</h1>
          <p className="text-gray-500">สำนักพัฒนาการเรียนรู้ มหาวิทยาลัยกรุงเทพ</p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-4 font-bold serif">หลักสูตร</th>
              <th className="text-center py-4 font-bold serif">วัน/เวลา</th>
              <th className="text-center py-4 font-bold serif">ห้อง</th>
              <th className="text-center py-4 font-bold serif">ปีการศึกษา</th>
              <th className="text-center py-4 font-bold serif">จำนวนผู้ลงทะเบียน</th>
              <th className="text-center py-4 font-bold serif">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course) => {
              const year = academicYears.find((y) => y.id === course.academicYearId);
              const count = registrations.filter((r) => r.courseId === course.id).length;

              return (
                <tr key={course.id} className="border-b border-gray-100">
                  <td className="py-4">{course.title}</td>
                  <td className="text-center py-4 text-xs">
                    {formatDate(course.date)}
                    <br />
                    {course.startTime} - {course.endTime}
                  </td>
                  <td className="text-center py-4">{course.room || '-'}</td>
                  <td className="text-center py-4">{year?.year}</td>
                  <td className="text-center py-4 font-bold">
                    {count} / {course.maxParticipants}
                  </td>
                  <td className="text-center py-4">
                    {count >= course.maxParticipants ? 'เต็ม' : 'เปิดรับ'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subLabel: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-5"
    >
      <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold serif">{value}</span>
          <span className="text-xs text-gray-500">{subLabel}</span>
        </div>
      </div>
    </motion.div>
  );
}
