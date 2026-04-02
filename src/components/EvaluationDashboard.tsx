import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Course, Evaluation } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ClipboardList, MessageSquare, TrendingUp, Users, Search } from 'lucide-react';

interface Props {
  courses: Course[];
}

const QUESTIONS = [
  "หัวข้อการอบรมมีความน่าสนใจและทันสมัย",
  "การอบรมครอบคลุมเนื้อหาได้ครบถ้วน",
  "เนื้อหาสาระและกิจกรรมของการอบรม เหมาะสม",
  "สามารถนำความรู้ที่ได้ ไปประยุกต์ใช้ได้จริง",
  "วิทยากรมีความรู้ ประสบการณ์ และเชี่ยวชาญ",
  "วิทยากรถ่ายทอดความรู้ได้ดี และมีกิจกรรมที่เหมาะสม",
  "วิทยากรเปิดโอกาสให้มีส่วนร่วมและแสดงความคิดเห็น",
  "วิทยากรคำนึงถึงความแตกต่างด้านทักษะและพื้นฐาน",
  "ระยะเวลาในการอบรม เหมาะสมและครอบคลุม",
  "ความรู้สึกพึงพอใจโดยรวมต่อการอบรมครั้งนี้"
];

export default function EvaluationDashboard({ courses }: Props) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedCourseId) {
      setEvaluations([]);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'evaluations'),
      where('courseId', '==', selectedCourseId),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setEvaluations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Evaluation)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedCourseId]);

  const calculateStats = () => {
    if (evaluations.length === 0) return [];

    const stats = QUESTIONS.map((q, idx) => {
      const counts = [0, 0, 0, 0, 0]; // for ratings 1, 2, 3, 4, 5
      evaluations.forEach(ev => {
        const rating = ev.ratings[idx];
        if (rating >= 1 && rating <= 5) {
          counts[rating - 1]++;
        }
      });

      // Calculate weighted average or percentage of 4-5
      const total = evaluations.length;
      const sum = evaluations.reduce((acc, ev) => acc + ev.ratings[idx], 0);
      const avg = sum / total;
      const percentage = (avg / 5) * 100;

      return {
        name: `ข้อ ${idx + 1}`,
        question: q,
        avg: avg.toFixed(2),
        percentage: percentage.toFixed(1),
        counts
      };
    });

    return stats;
  };

  const stats = calculateStats();
  const totalEvaluations = evaluations.length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
              <TrendingUp className="text-primary w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold serif">แดชบอร์ดผลการประเมิน</h2>
              <p className="text-gray-400 text-sm">สรุปผลการประเมินความพึงพอใจรายหลักสูตร</p>
            </div>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              className="w-full bg-gray-50 border-none rounded-2xl p-4 pl-12 focus:ring-2 focus:ring-primary/20 outline-none appearance-none font-bold text-sm"
              value={selectedCourseId}
              onChange={e => setSelectedCourseId(e.target.value)}
            >
              <option value="">เลือกหลักสูตรเพื่อดูผล...</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedCourseId ? (
        <div className="bg-white rounded-[2rem] p-20 text-center border border-dashed border-gray-200">
          <ClipboardList className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">กรุณาเลือกหลักสูตรเพื่อแสดงข้อมูลสถิติ</p>
        </div>
      ) : totalEvaluations === 0 ? (
        <div className="bg-white rounded-[2rem] p-20 text-center border border-dashed border-gray-200">
          <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">ยังไม่มีผู้ส่งแบบประเมินสำหรับหลักสูตรนี้</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Summary Cards */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 flex items-center gap-6">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
                <Users className="text-blue-500 w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">ผู้ตอบแบบประเมิน</p>
                <p className="text-3xl font-black text-gray-900">{totalEvaluations} <span className="text-sm font-normal text-gray-400">ท่าน</span></p>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 flex items-center gap-6">
              <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center">
                <TrendingUp className="text-green-500 w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">คะแนนเฉลี่ยรวม</p>
                <p className="text-3xl font-black text-gray-900">
                  {(stats.reduce((acc, s) => acc + parseFloat(s.avg), 0) / stats.length).toFixed(2)}
                  <span className="text-sm font-normal text-gray-400"> / 5.00</span>
                </p>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 flex items-center gap-6">
              <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center">
                <MessageSquare className="text-purple-500 w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">ความพึงพอใจร้อยละ</p>
                <p className="text-3xl font-black text-gray-900">
                  {(stats.reduce((acc, s) => acc + parseFloat(s.percentage), 0) / stats.length).toFixed(1)}
                  <span className="text-sm font-normal text-gray-400"> %</span>
                </p>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
            <h3 className="text-xl font-bold serif mb-8">สรุปคะแนนรายข้อ (ร้อยละ)</h3>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: any, props: any) => [`${value}%`, 'ความพึงพอใจ']}
                    labelFormatter={(label) => {
                      const item = stats.find(s => s.name === label);
                      return item ? item.question : label;
                    }}
                  />
                  <Bar dataKey="percentage" radius={[8, 8, 0, 0]} barSize={40}>
                    {stats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={parseFloat(entry.percentage) > 80 ? '#10b981' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 overflow-y-auto max-h-[500px]">
            <h3 className="text-xl font-bold serif mb-6">รายละเอียดรายข้อ</h3>
            <div className="space-y-6">
              {stats.map((s, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between items-start gap-4">
                    <p className="text-xs font-bold text-gray-900 leading-tight flex-1">{idx + 1}. {s.question}</p>
                    <span className="text-xs font-black text-primary">{s.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-primary h-full rounded-full transition-all duration-1000" 
                      style={{ width: `${s.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Suggestions */}
          <div className="lg:col-span-3 bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-8">
              <MessageSquare className="text-primary w-6 h-6" />
              <h3 className="text-xl font-bold serif">ข้อเสนอแนะเพิ่มเติม</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {evaluations.filter(ev => ev.suggestion).map((ev, idx) => (
                <div key={idx} className="bg-gray-50 rounded-3xl p-6 relative group hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-gray-100">
                  <p className="text-sm text-gray-600 italic leading-relaxed">"{ev.suggestion}"</p>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-1">
                    <p className="text-[10px] font-bold text-primary uppercase">{ev.submitterName || 'ไม่ระบุชื่อ'}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400">
                        {ev.submitterEmail || 'ไม่ระบุอีเมล'}
                      </span>
                      <span className="text-[10px] text-gray-400 font-bold">
                        {ev.timestamp?.toDate ? new Date(ev.timestamp.toDate()).toLocaleDateString('th-TH') : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {evaluations.filter(ev => ev.suggestion).length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-400 italic">
                  ไม่มีข้อเสนอแนะเพิ่มเติม
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
