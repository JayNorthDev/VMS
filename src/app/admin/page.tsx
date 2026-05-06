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
  CreditCard,
  Scan,
  ShieldAlert,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCollection, useMemoFirebase, signOutUser, useFirebase } from '@/firebase';
import { collection, doc, Timestamp, setDoc, query, orderBy, getDoc, where } from 'firebase/firestore';
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
import type { VisitorEntry, UserProfile, AuditLog, IDCard } from '@/lib/types';
import { logAuditAction } from '@/lib/audit';
import { SidebarProvider, Sidebar, SidebarTrigger, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarFooter, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { startOfToday, subDays, format, eachDayOfInterval, startOfMonth, startOfYear, getMonth, startOfWeek, isAfter, isSameDay } from 'date-fns';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '@/hooks/useAuth';
import { QRScanner } from '@/components/qr-scanner';
import { decryptQRData } from '@/lib/qr-security';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';


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
    if (!userProfile?.permissions) return [];
    return allNavItems.filter(item => userProfile.permissions.includes(item.permission));
  }, [userProfile?.permissions]);
  
  const [activeView, setActiveView] = useState<AdminView>(availableNavItems[0]?.id || 'dashboard');

  const visitorEntriesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'visitorEntries') : null), [firestore]);
  const { data: allVisitors, isLoading: visitorsLoading } = useCollection<VisitorEntry>(visitorEntriesQuery);

  const handleSignOut = async () => { await signOutUser(); router.replace('/'); };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView allVisitors={allVisitors || []} isLoading={visitorsLoading} />;
      case 'active_visitors': return <ActiveVisitorsByDivisionView allVisitors={allVisitors || []} />;
      case 'history': return <HistoryView allVisitors={allVisitors || []} isLoading={visitorsLoading} userProfile={userProfile} />;
      case 'access_management': return <AccessManagementView userProfile={userProfile} />;
      case 'audit_trail': return <AuditTrailView />;
      default: return <DashboardView allVisitors={allVisitors || []} isLoading={visitorsLoading} />;
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      <Sidebar className="flex flex-col bg-blue-950 text-white">
        <SidebarHeader className="p-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Logo" width={40} height={40} />
            <div className="flex flex-col"><h1 className="text-xl font-bold leading-none">Admin Panel</h1><span className="text-[10px] opacity-60 uppercase tracking-widest">Badulla Police Station</span></div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3">
          <SidebarMenu>
            {availableNavItems.map(item => (
                 <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton className="hover:bg-blue-900 text-gray-100" isActive={activeView === item.id} onClick={() => setActiveView(item.id)}>
                        {item.icon} <span className="ml-2 font-medium">{item.label}</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
            {(userProfile?.permissions?.includes('Card Management') || userProfile?.permissions?.includes('Access Management')) && (
              <SidebarMenuItem>
                <SidebarMenuButton className="hover:bg-blue-900 text-gray-100" onClick={() => router.push('/admin/cards')}>
                  <CreditCard /> <span className="ml-2 font-medium">Card Management</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4 border-t border-white/10">
           {userProfile && (
             <>
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-blue-800 flex items-center justify-center font-bold text-sm">
                    {userProfile?.name?.charAt(0) || "U"}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{userProfile.name}</span>
                    <span className="text-[10px] opacity-60">{userProfile.role}</span>
                  </div>
              </div>
              <Button variant="ghost" className="w-full justify-start text-white hover:bg-red-950 hover:text-white" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
              </Button>
             </>
           )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="flex-1 p-8">
        {renderContent()}
      </SidebarInset>
    </div>
  );
}

export default function AdminPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  if (loading) return <div className="flex items-center justify-center h-screen"><p>Loading...</p></div>;
  if (!user || !userData || userData.role !== 'Admin') { router.replace('/'); return null; }
  
  return <SidebarProvider><AdminLayout userProfile={userData} /></SidebarProvider>;
}

const DashboardView = ({ allVisitors, isLoading }: { allVisitors: VisitorEntry[], isLoading: boolean }) => {
    const { firestore } = useFirebase();
    const [isVerifying, setIsVerifying] = useState(false);
    const [scannedCard, setScannedCard] = useState<{ card: IDCard, visitor?: VisitorEntry | null } | null>(null);
    const { toast } = useToast();

    const handleVerifyScan = async (decodedText: string) => {
      const decrypted = decryptQRData(decodedText);
      if (!decrypted.includes('verify-police-vms')) {
        toast({ variant: 'destructive', title: 'Security Alert', description: 'This card was not issued by Badulla Police Station.' });
        return;
      }
      const [cardId] = decrypted.split('|');
      setIsVerifying(false);
      
      if (!firestore) return;
      const cardSnap = await getDoc(doc(firestore, 'generated_id_cards', cardId));
      if (cardSnap.exists()) {
        const cardData = cardSnap.data() as IDCard;
        let visitorData = null;
        if (cardData.status === 'allocated') {
          const activeVisitor = allVisitors.find(v => v.status === 'IN' && v.allocatedCardId === cardId);
          visitorData = activeVisitor || null;
        }
        setScannedCard({ card: cardData, visitor: visitorData });
      } else {
        toast({ variant: 'destructive', title: 'Not Found', description: 'This card ID does not exist in our database.' });
      }
    };

    const stats = useMemo(() => {
        const todayStart = startOfToday();
        return {
            today: allVisitors.filter(v => v.checkInTime.toDate() >= todayStart).length,
            active: allVisitors.filter(v => v.status === 'IN').length,
            completed: allVisitors.filter(v => v.checkOutTime && v.checkOutTime.toDate() >= todayStart && v.taskStatus === 'Completed').length,
            pending: allVisitors.filter(v => v.checkOutTime && v.checkOutTime.toDate() >= todayStart && v.taskStatus === 'Incomplete').length,
        }
    }, [allVisitors]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
              <div><h1 className="text-3xl font-bold">Admin Dashboard</h1><p className="text-muted-foreground">Comprehensive overview of station traffic and logs.</p></div>
              <Button size="lg" className="bg-blue-950" onClick={() => setIsVerifying(true)}><Scan className="mr-2 h-5 w-5" /> Verify Card</Button>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card><CardHeader className="pb-2 flex flex-row justify-between"><CardTitle className="text-sm font-medium">Today's Total</CardTitle><Users className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : stats.today}</div></CardContent></Card>
                <Card><CardHeader className="pb-2 flex flex-row justify-between"><CardTitle className="text-sm font-medium">Currently Inside</CardTitle><UserCheck className="h-4 w-4 text-blue-500"/></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : stats.active}</div></CardContent></Card>
                <Card><CardHeader className="pb-2 flex flex-row justify-between"><CardTitle className="text-sm font-medium">Tasks Completed</CardTitle><BadgeCheck className="h-4 w-4 text-green-500"/></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : stats.completed}</div></CardContent></Card>
                <Card><CardHeader className="pb-2 flex flex-row justify-between"><CardTitle className="text-sm font-medium">Tasks Pending</CardTitle><BadgeAlert className="h-4 w-4 text-orange-500"/></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : stats.pending}</div></CardContent></Card>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-2"><CardHeader><CardTitle>Division Distribution</CardTitle></CardHeader><CardContent className="h-80"><DivisionVisitorsChart visitors={allVisitors}/></CardContent></Card>
                <Card><CardHeader><CardTitle>Identification Overview</CardTitle><CardDescription>Visitors with vs. without ID.</CardDescription></CardHeader><CardContent className="h-80"><IdentificationOverviewChart visitors={allVisitors}/></CardContent></Card>
            </div>

            {isVerifying && (
              <Dialog open={isVerifying} onOpenChange={setIsVerifying}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader><DialogTitle>Verify System Card</DialogTitle><DialogDescription>Scan a visitor ID card to check its real-time status and ownership.</DialogDescription></DialogHeader>
                  <QRScanner onScanSuccess={handleVerifyScan} />
                </DialogContent>
              </Dialog>
            )}

            {scannedCard && (
              <Dialog open={!!scannedCard} onOpenChange={() => setScannedCard(null)}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard /> Card Verification</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex justify-between items-center p-4 rounded-lg bg-muted">
                      <div><div className="text-xs uppercase opacity-60">Card ID</div><div className="text-xl font-black">{scannedCard.card.cardId}</div></div>
                      <Badge variant={scannedCard.card.status === 'available' ? 'default' : 'destructive'} className="h-8 px-4 text-sm">{scannedCard.card.status.toUpperCase()}</Badge>
                    </div>
                    {scannedCard.visitor ? (
                      <div className="space-y-3">
                        <div className="text-sm font-bold border-b pb-1">Current Active Visitor</div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-blue-50 p-3 rounded-lg"><div className="text-xs opacity-60">Name</div><div className="font-bold">{scannedCard.visitor.fullName}</div></div>
                          <div className="bg-blue-50 p-3 rounded-lg"><div className="text-xs opacity-60">Identification</div><div className="font-bold">{scannedCard.visitor.identificationNumber}</div></div>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg"><div className="text-xs opacity-60">Check-In Time</div><div className="font-bold">{scannedCard.visitor.checkInTime.toDate().toLocaleString()}</div></div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 text-center bg-green-50 rounded-lg">
                        <BadgeCheck className="h-12 w-12 text-green-600 mb-2" />
                        <h4 className="font-bold">Card is Available</h4>
                        <p className="text-sm text-muted-foreground">This card is not currently assigned to any visitor.</p>
                      </div>
                    )}
                  </div>
                  <Button onClick={() => setScannedCard(null)} className="w-full">Close Report</Button>
                </DialogContent>
              </Dialog>
            )}
        </div>
    )
}

const DivisionVisitorsChart = ({ visitors }: { visitors: VisitorEntry[] }) => {
    const chartData = useMemo(() => {
        const divisionCounts = visitors.reduce((acc, v) => { acc[v.divisionId] = (acc[v.divisionId] || 0) + 1; return acc; }, {} as Record<string, number>);
        return divisionData.map(div => ({ name: div.en, visitors: divisionCounts[div.id] || 0, fill: div.color })).sort((a,b) => b.visitors - a.visitors);
    }, [visitors]);
    return (
        <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" fontSize={12}/><YAxis type="category" dataKey="name" width={120} fontSize={10}/><Tooltip/><Bar dataKey="visitors" radius={[0, 4, 4, 0]}/></BarChart></ResponsiveContainer>
    );
};

const IdentificationOverviewChart = ({ visitors }: { visitors: VisitorEntry[] }) => {
    const data = useMemo(() => {
        const withId = visitors.filter(v => v.identificationType !== 'None').length;
        const withoutId = visitors.filter(v => v.identificationType === 'None').length;
        return [{ name: 'With ID', value: withId }, { name: 'No ID', value: withoutId }];
    }, [visitors]);
    const COLORS = ['hsl(var(--chart-2))', 'hsl(var(--chart-5))'];
    return (
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"><Cell fill={COLORS[0]} /><Cell fill={COLORS[1]} /></Pie><Tooltip/><Legend verticalAlign="bottom" height={36}/></PieChart></ResponsiveContainer>
    );
};

const ActiveVisitorsByDivisionView = ({ allVisitors }: { allVisitors: VisitorEntry[] }) => {
   const stats = useMemo(() => divisionData.map(div => ({ ...div, count: allVisitors.filter(v => v.status === 'IN' && v.divisionId === div.id).length })), [allVisitors]);
   return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {stats.map(div => (
        <Card key={div.id} style={{ backgroundColor: div.color, color: div.text }}><CardHeader className="pb-2"><CardTitle className="text-sm font-bold">{div.en}</CardTitle></CardHeader><CardContent><div className="text-3xl font-black">{div.count}</div></CardContent></Card>
      ))}
    </div>
   )
}

const HistoryView = ({ allVisitors, isLoading, userProfile }: { allVisitors: VisitorEntry[], isLoading: boolean, userProfile: UserProfile }) => {
    const history = useMemo(() => allVisitors.filter(v => v.status === 'OUT').sort((a,b) => b.checkOutTime!.toMillis() - a.checkOutTime!.toMillis()), [allVisitors]);
    return (
        <Card><CardHeader><CardTitle>Visitor History</CardTitle></CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>Visitor</TableHead><TableHead>Division</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead><TableHead>Task</TableHead></TableRow></TableHeader>
            <TableBody>{history.map(v => (
              <TableRow key={v.id}><TableCell><div className="font-bold">{v.fullName}</div><div className="text-xs">{v.identificationNumber}</div></TableCell><TableCell>{v.divisionEnglishName}</TableCell><TableCell>{v.checkInTime.toDate().toLocaleTimeString()}</TableCell><TableCell>{v.checkOutTime?.toDate().toLocaleTimeString()}</TableCell><TableCell><Badge variant={v.taskStatus === 'Completed' ? 'default' : 'destructive'}>{v.taskStatus}</Badge></TableCell></TableRow>
            ))}</TableBody></Table>
        </CardContent></Card>
    )
}

const AccessManagementView = ({ userProfile }: { userProfile: UserProfile }) => {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'users') : null, [firestore]);
  const { data: users, isLoading: usersLoading } = useCollection<UserProfile>(usersQuery);

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), role: z.enum(["Admin", "Visitor Management"]), permissions: z.array(z.string()).min(1) })),
    defaultValues: { name: "", email: "", password: "", role: "Visitor Management", permissions: [] as string[] }
  });

  const selectedRole = form.watch("role");

  // Strict permission options based on role
  const permissionOptions = useMemo(() => {
    if (selectedRole === "Admin") {
      return [
        "Admin Dashboard",
        "Active Visitors by Division",
        "Visitor History",
        "Audit Trail",
        "Access Management",
        "Card Management"
      ];
    } else {
      return [
        "Check-In",
        "Active",
        "History"
      ];
    }
  }, [selectedRole]);

  // When role changes, clear current permissions to prevent cross-contamination
  useEffect(() => {
    form.setValue("permissions", []);
  }, [selectedRole, form]);

  const onSubmit = async (values: any) => {
    if (!firestore) return;
    setIsSubmitting(true);
    const secondaryApp = initializeApp(firebaseConfig, `app-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, values.email, values.password);
      await setDoc(doc(firestore, "users", cred.user.uid), { name: values.name, email: values.email, role: values.role, permissions: values.permissions });
      logAuditAction(firestore, userProfile.name, 'User Created', `User: ${values.name} (${values.role})`);
      toast({ title: "User created" });
      form.reset();
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="space-y-8">
      <Card><CardHeader><CardTitle>Create User</CardTitle></CardHeader><CardContent>
        <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="password" render={({ field }) => (<FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="role" render={({ field }) => (<FormItem><FormLabel>Role</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Admin">Admin</SelectItem><SelectItem value="Visitor Management">Staff</SelectItem></SelectContent></Select></FormItem>)} />
          </div>
          <FormField control={form.control} name="permissions" render={({ field }) => (
            <FormItem><FormLabel>Permissions</FormLabel><div className="grid grid-cols-3 gap-2">{permissionOptions.map(p => (
              <div key={p} className="flex items-center gap-2"><Checkbox checked={field.value.includes(p)} onCheckedChange={(c) => c ? field.onChange([...field.value, p]) : field.onChange(field.value.filter(v => v !== p))}/><span className="text-xs">{p}</span></div>
            ))}</div></FormItem>
          )} />
          <Button type="submit" disabled={isSubmitting}>Create User</Button>
        </form></Form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Users</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Permissions</TableHead></TableRow></TableHeader>
        <TableBody>{users?.map(u => (<TableRow key={u.id}><TableCell>{u.name}</TableCell><TableCell><Badge>{u.role}</Badge></TableCell><TableCell className="text-xs opacity-70">{u.permissions?.join(', ')}</TableCell></TableRow>))}</TableBody></Table>
      </CardContent></Card>
    </div>
  )
}

const AuditTrailView = () => {
    const { firestore } = useFirebase();
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('all');
    
    const logsQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc')) : null), [firestore]);
    const { data: logs, isLoading } = useCollection<AuditLog>(logsQuery);

    const filteredLogs = useMemo(() => {
        if (!logs) return [];
        let result = logs;

        // Text Search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(l => 
                l.userName.toLowerCase().includes(term) || 
                l.action.toLowerCase().includes(term) || 
                l.details.toLowerCase().includes(term)
            );
        }

        // Date Filter
        const today = startOfToday();
        if (dateFilter === 'today') {
            result = result.filter(l => isSameDay(l.timestamp.toDate(), today));
        } else if (dateFilter === 'yesterday') {
            const yesterday = subDays(today, 1);
            result = result.filter(l => isSameDay(l.timestamp.toDate(), yesterday));
        } else if (dateFilter === 'week') {
            const lastWeek = subDays(today, 7);
            result = result.filter(l => isAfter(l.timestamp.toDate(), lastWeek));
        }

        return result;
    }, [logs, searchTerm, dateFilter]);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Audit Trail</CardTitle>
                    <CardDescription>Comprehensive log of all system actions.</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search logs..." 
                            className="pl-9 w-[250px]" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Time</SelectItem>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="week">Last 7 Days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Timestamp</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={4} className="text-center">Loading logs...</TableCell></TableRow>
                        ) : filteredLogs.length > 0 ? (
                            filteredLogs.map(l => (
                                <TableRow key={l.id}>
                                    <TableCell className="text-xs whitespace-nowrap">
                                        {l.timestamp?.toDate().toLocaleString()}
                                    </TableCell>
                                    <TableCell className="font-medium">{l.userName}</TableCell>
                                    <TableCell><Badge variant="secondary">{l.action}</Badge></TableCell>
                                    <TableCell className="text-xs opacity-80">{l.details}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No audit logs found matching your criteria.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
