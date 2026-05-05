
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  LogOut,
  Users,
  UserCheck,
  LayoutDashboard,
  Building,
  Clock,
  UserCog,
  ScrollText,
  BadgeCheck,
  BadgeAlert,
  Download,
  Trash2,
  Edit,
  UserPlus,
  User,
  CreditCard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCollection, useMemoFirebase, signOutUser, useFirebase } from '@/firebase';
import { collection, doc, Timestamp, setDoc, query, orderBy } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { divisionData } from '@/lib/divisions';
import type { VisitorEntry, UserProfile, AuditLog } from '@/lib/types';
import { logAuditAction } from '@/lib/audit';
import { SidebarProvider, Sidebar, SidebarTrigger, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarFooter, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { startOfToday, subDays, format, eachDayOfInterval, startOfMonth, startOfYear, getMonth, startOfWeek, isAfter } from 'date-fns';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, Sector } from 'recharts';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '@/hooks/useAuth';


type AdminView = 'dashboard' | 'active_visitors' | 'history' | 'access_management' | 'audit_trail';

const allNavItems: { id: AdminView; label: string; icon: React.ReactNode; permission: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard />, permission: 'Admin Dashboard' },
    { id: 'active_visitors', label: 'Active By Division', icon: <Building />, permission: 'Active Visitors by Division' },
    { id: 'history', label: 'Visitor History', icon: <Clock />, permission: 'Visitor History' },
    { id: 'access_management', label: 'Access Management', icon: <UserCog />, permission: 'Access Management' },
    { id: 'audit_trail', label: 'Audit Trail', icon: <ScrollText />, permission: 'Audit Trail' }
];

function AdminLayout({ userProfile }: { userProfile: UserProfile }) {
  const router = useRouter();
  const { firestore } = useFirebase();
  const { isMobile, setOpenMobile } = useSidebar();
  
  const availableNavItems = useMemo(() => {
    if (!userProfile.permissions) return [];
    return allNavItems.filter(item => userProfile.permissions.includes(item.permission));
  }, [userProfile.permissions]);
  
  const [activeView, setActiveView] = useState<AdminView>(availableNavItems[0]?.id || 'dashboard');

  useEffect(() => {
    if (availableNavItems.length > 0 && !availableNavItems.some(item => item.id === activeView)) {
      setActiveView(availableNavItems[0].id);
    }
  }, [availableNavItems, activeView]);

  const visitorEntriesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'visitorEntries') : null),
    [firestore]
  );
  const { data: allVisitors, isLoading: visitorsLoading } = useCollection<VisitorEntry>(visitorEntriesQuery);

  const handleSignOut = async () => {
    await signOutUser();
    router.replace('/');
  };

  const handleNavigation = (view: AdminView) => {
    setActiveView(view);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const renderContent = () => {
    const hasPermission = availableNavItems.some(item => item.id === activeView);
    if (!hasPermission) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle>Access Denied</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>You do not have permission to view this section. Please contact an administrator.</p>
                </CardContent>
            </Card>
        )
    }

    switch (activeView) {
      case 'dashboard':
        return <DashboardView allVisitors={allVisitors || []} isLoading={visitorsLoading} />;
      case 'active_visitors':
        return <ActiveVisitorsByDivisionView allVisitors={allVisitors || []} />;
      case 'history':
        return <HistoryView allVisitors={allVisitors || []} isLoading={visitorsLoading} userProfile={userProfile} />;
      case 'access_management':
        return <AccessManagementView userProfile={userProfile} />;
      case 'audit_trail':
        return <AuditTrailView />;
      default:
        return <DashboardView allVisitors={allVisitors || []} isLoading={visitorsLoading} />;
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      <Sidebar className="flex flex-col">
        <SidebarHeader>
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Police VMS Logo" width={40} height={40} />
            <h1 className="text-xl font-bold">Admin Panel</h1>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {availableNavItems.map(item => (
                 <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton isActive={activeView === item.id} onClick={() => handleNavigation(item.id as AdminView)}>
                        {item.icon} {item.label}
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => router.push('/admin/cards')}>
                <CreditCard /> ID Card Management
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
           <div className="flex items-center gap-3 p-2 border-t border-sidebar-border">
                <User className="w-6 h-6"/>
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{userProfile.name}</span>
                    <span className="text-xs text-gray-400">{userProfile.role}</span>
                </div>
            </div>
           <SidebarMenu>
              <SidebarMenuItem>
                  <SidebarMenuButton onClick={handleSignOut} className="w-full justify-start">
                      <LogOut />
                      Sign Out
                  </SidebarMenuButton>
              </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="flex-1 p-4 sm:p-6 lg:p-8">
         <header className="flex items-center justify-between md:hidden mb-4 p-2 bg-white dark:bg-gray-800 rounded-md shadow">
          <div className="flex items-center gap-2">
               <Image src="/logo.png" alt="Police VMS Logo" width={32} height={32} />
               <span className="font-bold">Admin Panel</span>
          </div>
           <SidebarTrigger />
         </header>
        {renderContent()}
      </SidebarInset>
    </div>
  );
}

export default function AdminPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user || !userData || userData.role !== 'Admin') {
        router.replace('/');
      }
    }
  }, [user, userData, loading, router]);
  
  if (loading || !user || !userData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }
  
  if (user && userData && userData.role === 'Admin') {
    return (
      <SidebarProvider>
        <AdminLayout userProfile={userData} />
      </SidebarProvider>
    );
  }

  return null;
}


// --- Admin Sub-Views ---

const DashboardView = ({ allVisitors, isLoading }: { allVisitors: VisitorEntry[], isLoading: boolean }) => {
    const [trendFilter, setTrendFilter] = useState('week');
    
    const stats = useMemo(() => {
        if (isLoading || !allVisitors) {
            return { completedToday: 0, pendingToday: 0, active: 0, today: 0 };
        }
        
        const todayStart = startOfToday();
        
        const todaysCheckIns = allVisitors.filter(v => v.checkInTime.toDate() >= todayStart).length;
        const activeVisitorsCount = allVisitors.filter(v => v.status === 'IN').length;
        
        const checkedOutToday = allVisitors.filter(v => v.checkOutTime && v.checkOutTime.toDate() >= todayStart);
        
        const completedToday = checkedOutToday.filter(v => v.taskStatus === 'Completed').length;
        const pendingToday = checkedOutToday.filter(v => v.taskStatus === 'Incomplete').length;

        return {
            completed: completedToday,
            pending: pendingToday,
            active: activeVisitorsCount,
            today: todaysCheckIns,
        }
    }, [allVisitors, isLoading]);

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Visitors Today</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats.today}</div>
                        <p className="text-xs text-muted-foreground">Total check-ins for today</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Visitors</CardTitle>
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats.active}</div>
                        <p className="text-xs text-muted-foreground">Currently inside</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tasks Completed Today</CardTitle>
                        <BadgeCheck className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats.completed}</div>
                        <p className="text-xs text-muted-foreground">Checked out with completed task</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tasks Pending Today</CardTitle>
                        <BadgeAlert className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats.pending}</div>
                        <p className="text-xs text-muted-foreground">Checked out with pending task</p>
                    </CardContent>
                </Card>
            </div>
            <Card className="mb-6">
                 <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                      <div>
                        <CardTitle>Visitor Trends</CardTitle>
                        <CardDescription>Visitor check-ins over time.</CardDescription>
                      </div>
                      <Tabs value={trendFilter} onValueChange={setTrendFilter} className="w-full sm:w-auto">
                          <TabsList className="grid w-full grid-cols-3">
                              <TabsTrigger value="week">Week</TabsTrigger>
                              <TabsTrigger value="month">Month</TabsTrigger>
                              <TabsTrigger value="year">Year</TabsTrigger>
                          </TabsList>
                      </Tabs>
                    </div>
                </CardHeader>
                <CardContent className='h-96'>
                    <VisitorTrendsChart visitors={allVisitors} filter={trendFilter} />
                </CardContent>
            </Card>
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Visitors by Division</CardTitle>
                        <CardDescription>Total visitor distribution across divisions.</CardDescription>
                    </CardHeader>
                    <CardContent className='h-96'>
                        <DivisionVisitorsChart visitors={allVisitors} />
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Task Status Distribution</CardTitle>
                        <CardDescription>Breakdown of all completed vs. pending tasks.</CardDescription>
                    </CardHeader>
                    <CardContent className='h-96'>
                        <TaskStatusChart visitors={allVisitors} />
                    </CardContent>
                </Card>
                 <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Identification Overview</CardTitle>
                        <CardDescription>Breakdown of visitors with and without ID.</CardDescription>
                    </CardHeader>
                    <CardContent className='h-96'>
                        <IdentificationOverviewChart visitors={allVisitors} />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

const VisitorTrendsChart = ({ visitors, filter }: { visitors: VisitorEntry[], filter: string }) => {
    const trendData = useMemo(() => {
        if (!visitors) return [];
        const now = new Date();

        if (filter === 'year') {
            const yearStart = startOfYear(now);
            const visitorsThisYear = visitors.filter(v => v.checkInTime.toDate() >= yearStart);
            const monthlyCounts: Record<number, number> = {};
            
            visitorsThisYear.forEach(v => {
                const month = getMonth(v.checkInTime.toDate());
                monthlyCounts[month] = (monthlyCounts[month] || 0) + 1;
            });

            return Array.from({ length: 12 }).map((_, i) => ({
                name: format(new Date(now.getFullYear(), i), 'MMM'),
                visitors: monthlyCounts[i] || 0
            }));
        }

        const days = filter === 'week' ? 7 : 30;
        const startDate = subDays(now, days - 1);
        const dateRange = eachDayOfInterval({ start: startDate, end: now });

        const dailyCounts = visitors.reduce((acc, v) => {
            const dayKey = format(v.checkInTime.toDate(), 'yyyy-MM-dd');
            acc[dayKey] = (acc[dayKey] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return dateRange.map(day => ({
            name: format(day, days === 7 ? 'EEE' : 'MMM d'),
            visitors: dailyCounts[format(day, 'yyyy-MM-dd')] || 0
        }));

    }, [visitors, filter]);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                    contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                    }}
                />
                <Line type="monotone" dataKey="visitors" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
        </ResponsiveContainer>
    );
};

const DivisionVisitorsChart = ({ visitors }: { visitors: VisitorEntry[] }) => {
    const chartData = useMemo(() => {
        if (!visitors) return [];
        const divisionCounts = visitors.reduce((acc, v) => {
            acc[v.divisionId] = (acc[v.divisionId] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return divisionData.map(div => ({
            name: div.en,
            visitors: divisionCounts[div.id] || 0,
            fill: div.color
        })).sort((a,b) => b.visitors - a.visitors);

    }, [visitors]);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                 <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                    cursor={{ fill: 'hsla(var(--muted))' }}
                     contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                    }}
                />
                <Bar dataKey="visitors" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};

const TaskStatusChart = ({ visitors }: { visitors: VisitorEntry[] }) => {
    const chartData = useMemo(() => {
        if (!visitors) return [{ name: 'N/A', value: 1 }];
        const completed = visitors.filter(v => v.taskStatus === 'Completed').length;
        const incomplete = visitors.filter(v => v.taskStatus === 'Incomplete').length;
        if (completed === 0 && incomplete === 0) return [];
        return [
            { name: 'Completed', value: completed },
            { name: 'Incomplete', value: incomplete },
        ];
    }, [visitors]);

    const COLORS = ['hsl(var(--chart-2))', 'hsl(var(--chart-5))']; // Green, Orange

    return (
        <ResponsiveContainer width="100%" height="100%">
             {chartData.length > 0 ? (
            <PieChart>
                <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                     contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                    }}
                />
                <Legend />
            </PieChart>
            ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                    No task status data available.
                </div>
            )}
        </ResponsiveContainer>
    );
};

const IdentificationOverviewChart = ({ visitors }: { visitors: VisitorEntry[] }) => {
    const chartData = useMemo(() => {
        if (!visitors || visitors.length === 0) return [];

        const withId = visitors.filter(v => v.identificationType !== 'None').length;
        const withoutId = visitors.filter(v => v.identificationType === 'None').length;
        
        if (withId === 0 && withoutId === 0) return [];
        
        return [
            { name: 'With ID', value: withId },
            { name: 'Without ID', value: withoutId },
        ];
    }, [visitors]);

    const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-3))'];

    return (
        <ResponsiveContainer width="100%" height="100%">
            {chartData.length > 0 ? (
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 'var(--radius)',
                        }}
                    />
                    <Legend />
                </PieChart>
            ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                    No identification data available.
                </div>
            )}
        </ResponsiveContainer>
    );
};


const ActiveVisitorsByDivisionView = ({ allVisitors }: { allVisitors: VisitorEntry[] }) => {
   const divisionStats = useMemo(() => {
    if (!allVisitors) return [];
    return divisionData.map(division => {
      const visitorsInDivision = allVisitors.filter(v => v.divisionId === division.id);
      const activeCount = visitorsInDivision.filter(v => v.status === 'IN').length;
      return { ...division, activeCount };
    });
  }, [allVisitors]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Visitors by Division</CardTitle>
        <CardDescription>Real-time count of visitors inside each division.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {divisionStats.map(div => (
            <div key={div.id} className="p-4 rounded-lg border flex items-center justify-between" style={{ backgroundColor: div.color, color: div.text }}>
              <div>
                <p className="font-bold text-lg">{div.en}</p>
                <p className="text-xs opacity-80">{div.si}</p>
              </div>
              <div className="text-3xl font-extrabold">{div.activeCount}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const HistoryView = ({ allVisitors, isLoading, userProfile }: { allVisitors: VisitorEntry[], isLoading: boolean, userProfile: UserProfile }) => {
    const { firestore } = useFirebase();
    const [historyFilter, setHistoryFilter] = useState('week');
    const [historySearch, setHistorySearch] = useState('');

    const historyWithDuration = useMemo(() => {
        if (!allVisitors) return [];
        let history = allVisitors
            .filter(v => v.status === 'OUT' && v.checkOutTime)
            .map(v => {
                const durationMs = v.checkOutTime!.toMillis() - v.checkInTime.toMillis();
                const minutes = Math.floor(durationMs / 60000);
                const seconds = Math.floor((durationMs % 60000) / 1000);
                return { ...v, duration: `${minutes}m ${seconds}s` };
            })
            .sort((a, b) => b.checkOutTime!.toMillis() - a.checkOutTime!.toMillis());
        
        const now = new Date();
        if (historyFilter === 'week') {
            const startOfThisWeek = startOfWeek(now);
            history = history.filter(v => v.checkOutTime!.toDate() && isAfter(v.checkOutTime!.toDate(), startOfThisWeek));
        } else if (historyFilter === 'month') {
            const startOfThisMonth = startOfMonth(now);
            history = history.filter(v => v.checkOutTime!.toDate() && isAfter(v.checkOutTime!.toDate(), startOfThisMonth));
        } else if (historyFilter === 'year') {
            const startOfThisYear = startOfYear(now);
            history = history.filter(v => v.checkOutTime!.toDate() && isAfter(v.checkOutTime!.toDate(), startOfThisYear));
        }

        if (historySearch) {
            const searchTerm = historySearch.toLowerCase();
            history = history.filter(v => 
                v.fullName.toLowerCase().includes(searchTerm) ||
                v.identificationNumber.toLowerCase().includes(searchTerm) ||
                (v.divisionEnglishName || '').toLowerCase().includes(searchTerm)
            );
        }
        
        return history;
    }, [allVisitors, historyFilter, historySearch]);

    const handleExportPdf = () => {
        const doc = new jsPDF();
        doc.text("Visitor History Report", 14, 15);

        (doc as any).autoTable({
            head: [['Visitor', 'ID', 'Division', 'Time In', 'Time Out', 'Duration', 'Task Status']],
            body: historyWithDuration.map(v => [
                v.fullName,
                `${v.identificationNumber} (${v.identificationType})`,
                v.divisionEnglishName || 'N/A',
                v.checkInTime.toDate().toLocaleString(),
                v.checkOutTime?.toDate().toLocaleString() || 'N/A',
                v.duration || 'N/A',
                v.taskStatus || 'N/A'
            ]),
            startY: 20
        });

        logAuditAction(firestore, userProfile.name, 'PDF Exported', 'Exported visitor history PDF report.');
        doc.save(`visitor_history_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                        <CardTitle>Visitor History</CardTitle>
                        <CardDescription>Complete log of all visitor entries and exits.</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input 
                            placeholder="Search Name, ID, Division..." 
                            value={historySearch} 
                            onChange={(e) => setHistorySearch(e.target.value)} 
                            className="w-full sm:w-auto"
                        />
                        <Select value={historyFilter} onValueChange={setHistoryFilter}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Filter by date" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="week">This Week</SelectItem>
                                <SelectItem value="month">This Month</SelectItem>
                                <SelectItem value="year">This Year</SelectItem>
                                <SelectItem value="all">All Time</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={handleExportPdf} disabled={isLoading || historyWithDuration.length === 0}>
                            <Download className="mr-2 h-4 w-4" /> Export PDF
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Visitor</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead>Time In</TableHead>
                    <TableHead>Time Out</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Task Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center">Loading data...</TableCell></TableRow>
                  ) : historyWithDuration.length > 0 ? (
                    historyWithDuration.map(visitor => (
                      <TableRow key={visitor.id}>
                        <TableCell>
                          <div className="font-medium">{visitor.fullName}</div>
                          <div className="text-sm text-muted-foreground">{visitor.identificationNumber} ({visitor.identificationType})</div>
                        </TableCell>
                        <TableCell>
                           <Badge style={{ backgroundColor: visitor.divisionBackgroundColorHex, color: visitor.divisionTextColorHex }}>{visitor.divisionEnglishName}</Badge>
                        </TableCell>
                        <TableCell>{visitor.checkInTime.toDate().toLocaleString()}</TableCell>
                        <TableCell>{visitor.checkOutTime?.toDate().toLocaleString()}</TableCell>
                        <TableCell>{visitor.duration}</TableCell>
                        <TableCell>
                          {visitor.taskStatus ? (
                            <Badge
                              className={
                                visitor.taskStatus === 'Completed'
                                  ? 'bg-green-600 text-white'
                                  : 'bg-orange-600 text-white'
                              }
                            >
                              {visitor.taskStatus}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">N/A</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={6} className="text-center">No history records found.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
    )
}

const permissionOptions = {
  Admin: ["Admin Dashboard", "Active Visitors by Division", "Visitor History", "Audit Trail", "Access Management"],
  "Visitor Management": ["Check-In", "Active", "History"],
};

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  role: z.enum(["Admin", "Visitor Management"], {
    required_error: "You need to select a role.",
  }),
  permissions: z.array(z.string()).refine((value) => value.length > 0, {
    message: "You have to select at least one permission.",
  }),
});


const AccessManagementView = ({ userProfile }: { userProfile: UserProfile }) => {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'users') : null, [firestore]);
  const { data: users, isLoading: usersLoading } = useCollection<UserProfile>(usersQuery);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "Visitor Management",
      permissions: [],
    },
  });

  const selectedRole = form.watch('role');

  useEffect(() => {
    form.setValue('permissions', []);
  }, [selectedRole, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore) return;
    setIsSubmitting(true);
    
    const secondaryAppName = `secondary-auth-app-${new Date().getTime()}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, values.email, values.password);
      const newUser = userCredential.user;

      await setDoc(doc(firestore, "users", newUser.uid), {
        name: values.name,
        email: values.email,
        role: values.role,
        permissions: values.permissions
      });

      logAuditAction(
          firestore,
          userProfile.name,
          'User Created',
          `Created new user: ${values.name} (${values.email}) with role: ${values.role}`
      );

      toast({ title: "User created successfully!" });
      form.reset();
      
    } catch (error: any) {
      console.error("Error creating user:", error);
      let description = "An unknown error occurred.";
      if (error.code === 'auth/email-already-in-use') {
        description = "This email is already registered.";
      }
      toast({ variant: "destructive", title: "Failed to create user", description });
    } finally {
      setIsSubmitting(false);
    }
  }


  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Create New User</CardTitle>
          <CardDescription>Add a new user and assign them a role and permissions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Visitor Management">Visitor Management</SelectItem>
                          <SelectItem value="Admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="user@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="permissions"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel>Permissions</FormLabel>
                      <FormDescription>
                        Select the permissions this user will have.
                      </FormDescription>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {permissionOptions[selectedRole].map((permission) => (
                        <FormField
                          key={permission}
                          control={form.control}
                          name="permissions"
                          render={({ field }) => {
                            return (
                              <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(permission)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...(field.value || []), permission])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== permission
                                            )
                                          );
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal text-sm">
                                  {permission}
                                </FormLabel>
                              </FormItem>
                            );
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : <><UserPlus className="mr-2 h-4 w-4" />Create User</> }
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Users</CardTitle>
          <CardDescription>A list of all users in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center">Loading users...</TableCell></TableRow>
              ) : users && users.length > 0 ? (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'Admin' ? 'destructive' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {user.permissions?.map(p => <Badge key={p} variant="outline" className="font-normal">{p}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" disabled>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" disabled>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="text-center">No users found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

const AuditTrailView = () => {
    const { firestore } = useFirebase();
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('all');
    
    const auditLogsQuery = useMemoFirebase(
        () => (firestore ? query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc')) : null),
        [firestore]
    );
    const { data: auditLogs, isLoading } = useCollection<AuditLog>(auditLogsQuery);

    const filteredLogs = useMemo(() => {
        if (!auditLogs) return [];
        let filtered = [...auditLogs];

        if (dateFilter !== 'all') {
            const todayStart = startOfToday();
            if (dateFilter === 'today') {
                filtered = filtered.filter(log => log.timestamp && log.timestamp.toDate() >= todayStart);
            } else if (dateFilter === 'yesterday') {
                const yesterdayStart = subDays(todayStart, 1);
                filtered = filtered.filter(log => {
                    if (!log.timestamp) return false;
                    const logDate = log.timestamp.toDate();
                    return logDate >= yesterdayStart && logDate < todayStart;
                });
            } else if (dateFilter === '7days') {
                const sevenDaysAgoStart = subDays(todayStart, 6);
                filtered = filtered.filter(log => log.timestamp && log.timestamp.toDate() >= sevenDaysAgoStart);
            }
        }

        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(log =>
                (log.userName?.toLowerCase().includes(lowercasedTerm)) ||
                (log.action?.toLowerCase().includes(lowercasedTerm)) ||
                (log.details?.toLowerCase().includes(lowercasedTerm))
            );
        }
        return filtered;
    }, [auditLogs, searchTerm, dateFilter]);

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                        <CardTitle>Audit Trail</CardTitle>
                        <CardDescription>Track user actions within the system.</CardDescription>
                    </div>
                     <div className="flex flex-wrap items-center gap-2">
                         <Input
                            placeholder="Search logs..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full sm:w-auto"
                        />
                        <Select value={dateFilter} onValueChange={setDateFilter}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Filter by date" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Time</SelectItem>
                                <SelectItem value="today">Today</SelectItem>
                                <SelectItem value="yesterday">Yesterday</SelectItem>
                                <SelectItem value="7days">Last 7 Days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date & Time</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={4} className="text-center">Loading audit trail...</TableCell></TableRow>
                        ) : filteredLogs && filteredLogs.length > 0 ? (
                            filteredLogs.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell>{log.timestamp ? log.timestamp.toDate().toLocaleString() : 'No date'}</TableCell>
                                    <TableCell>{log.userName}</TableCell>
                                    <TableCell><Badge variant="secondary">{log.action}</Badge></TableCell>
                                    <TableCell>{log.details}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={4} className="text-center">No audit records found for the selected criteria.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
