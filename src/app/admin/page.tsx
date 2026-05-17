
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
  CreditCard,
  Scan,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useCollection, useMemoFirebase, signOutUser, useFirebase } from '@/firebase';
import { collection, doc, setDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { divisionData } from '@/lib/divisions';
import type { VisitorEntry, UserProfile, AuditLog, IDCard } from '@/lib/types';
import { logAuditAction } from '@/lib/audit';
import { SidebarProvider, Sidebar, SidebarContent, SidebarMenuItem, SidebarMenu, SidebarMenuButton, SidebarHeader, SidebarFooter, SidebarInset } from '@/components/ui/sidebar';
import { startOfToday, subDays, isAfter, isSameDay } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      <Sidebar className="flex flex-col bg-sidebar text-sidebar-foreground">
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
                    <SidebarMenuButton isActive={activeView === item.id} onClick={() => setActiveView(item.id)}>
                        {item.icon} <span className="ml-2 font-medium">{item.label}</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
            {(userProfile?.permissions?.includes('Card Management') || userProfile?.permissions?.includes('Access Management')) && (
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => router.push('/admin/cards')}>
                  <CreditCard /> <span className="ml-2 font-medium">Card Management</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4 border-t border-sidebar-border">
           {userProfile && (
             <>
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center font-bold text-sm">
                    {userProfile?.name?.charAt(0) || "U"}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{userProfile.name}</span>
                    <span className="text-[10px] opacity-60">{userProfile.role}</span>
                  </div>
              </div>
              <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground" onClick={handleSignOut}>
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
      const [cardId, divisionId] = decrypted.split('|');
      setIsVerifying(false);
      
      if (!firestore) return;
      const cardSnap = await getDoc(doc(firestore, 'generated_id_cards', divisionId, 'cards', cardId));
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
              <Button size="lg" className="bg-primary text-primary-foreground" onClick={() => setIsVerifying(true)}><Scan className="mr-2 h-5 w-5" /> Verify Card</Button>
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
// Other sub-components remain unchanged in this patch but were provided for context
