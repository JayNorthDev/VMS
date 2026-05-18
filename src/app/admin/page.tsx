
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
  Plus,
  Trash2,
  Shield,
  Activity,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useCollection, useMemoFirebase, signOutUser, useFirebase } from '@/firebase';
import { collection, doc, getDoc, setDoc, deleteDoc, query, orderBy, where, collectionGroup } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';
import { useToast } from '@/hooks/use-toast';
import { divisionData, getPrefix } from '@/lib/divisions';
import type { VisitorEntry, UserProfile, IDCard, AuditLog } from '@/lib/types';
import { Sidebar, SidebarContent, SidebarMenuItem, SidebarMenu, SidebarMenuButton, SidebarHeader, SidebarFooter, SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { startOfToday, format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { QRScanner } from '@/components/qr-scanner';
import { decryptQRData } from '@/lib/qr-security';

const STAFF_PERMISSIONS = ['Check-In', 'Active', 'History'];
const ADMIN_PERMISSIONS = [
  'Admin Dashboard', 
  'Active Visitors by Division', 
  'Visitor History', 
  'Audit Trail', 
  'Access Management', 
  'Card Management'
];

const DashboardView = ({ allVisitors, isLoading }: { allVisitors: VisitorEntry[], isLoading: boolean }) => {
    const { firestore } = useFirebase();
    const [isVerifying, setIsVerifying] = useState(false);
    const [scannedCard, setScannedCard] = useState<{ card: IDCard, visitor?: VisitorEntry | null } | null>(null);
    const { toast } = useToast();

    const handleVerifyScan = async (decodedText: string) => {
      try {
        const decrypted = decryptQRData(decodedText);
        if (!decrypted.includes('verify-police-vms')) {
          toast({ variant: 'destructive', title: 'Security Alert', description: 'This card was not issued by this station.' });
          return;
        }
        const [cardId, divisionId] = decrypted.split('|');
        setIsVerifying(false);
        
        if (!firestore) return;

        const division = divisionData.find(d => d.id === divisionId);
        const prefix = division ? getPrefix(division.en) : cardId.split('-')[0];
        
        const cardSnap = await getDoc(doc(firestore, 'generated_id_cards', prefix, 'cards', cardId));
        if (cardSnap.exists()) {
          const cardData = cardSnap.data() as IDCard;
          let visitorData = null;
          if (cardData.status === 'allocated') {
            const activeVisitor = allVisitors.find(v => v.status === 'IN' && v.allocatedCardId === cardId);
            visitorData = activeVisitor || null;
          }
          setScannedCard({ card: cardData, visitor: visitorData });
        } else {
          toast({ variant: 'destructive', title: 'Not Found', description: 'Card ID does not exist.' });
        }
      } catch (error) {
        console.error('Error verifying card:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Verification failed.' });
      }
    };

    const stats = useMemo(() => {
        const todayStart = startOfToday();
        return {
            today: allVisitors.filter(v => v.checkInTime && v.checkInTime.toDate() >= todayStart).length,
            active: allVisitors.filter(v => v.status === 'IN').length,
            completed: allVisitors.filter(v => v.checkOutTime && v.checkOutTime.toDate() >= todayStart && v.outcome === 'Completed').length,
            pending: allVisitors.filter(v => v.status === 'IN').length,
        }
    }, [allVisitors]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
              <div><h1 className="text-3xl font-bold">Admin Dashboard</h1><p className="text-muted-foreground">Comprehensive overview of station traffic and logs.</p></div>
              <Button size="lg" onClick={() => setIsVerifying(true)}><Scan className="mr-2 h-5 w-5" /> Verify System Card</Button>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card><CardHeader className="pb-2 flex flex-row justify-between"><CardTitle className="text-sm font-medium">Today's Total</CardTitle><Users className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : stats.today}</div></CardContent></Card>
                <Card><CardHeader className="pb-2 flex flex-row justify-between"><CardTitle className="text-sm font-medium">Currently Inside</CardTitle><UserCheck className="h-4 w-4 text-blue-500"/></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : stats.active}</div></CardContent></Card>
                <Card><CardHeader className="pb-2 flex flex-row justify-between"><CardTitle className="text-sm font-medium">Tasks Completed</CardTitle><BadgeCheck className="h-4 w-4 text-green-500"/></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : stats.completed}</div></CardContent></Card>
                <Card><CardHeader className="pb-2 flex flex-row justify-between"><CardTitle className="text-sm font-medium">Pending Output</CardTitle><BadgeAlert className="h-4 w-4 text-orange-500"/></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : stats.pending}</div></CardContent></Card>
            </div>

            {isVerifying && (
              <Dialog open={isVerifying} onOpenChange={setIsVerifying}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader><DialogTitle>Scan ID Card</DialogTitle><DialogDescription>Hold the card QR code in front of the camera.</DialogDescription></DialogHeader>
                  <QRScanner onScanSuccess={handleVerifyScan} />
                </DialogContent>
              </Dialog>
            )}

            {scannedCard && (
              <Dialog open={!!scannedCard} onOpenChange={() => setScannedCard(null)}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard /> Verification Results</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex justify-between items-center p-4 rounded-lg bg-muted border">
                      <div><div className="text-xs uppercase opacity-60">Card Identifier</div><div className="text-xl font-black">{scannedCard.card.cardId}</div></div>
                      <Badge variant={scannedCard.card.status === 'available' ? 'default' : 'destructive'} className="h-8 px-4 text-sm">{scannedCard.card.status.toUpperCase()}</Badge>
                    </div>
                    {scannedCard.visitor ? (
                      <div className="space-y-3">
                        <div className="text-sm font-bold border-b pb-1">Current Holder</div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-blue-50 p-3 rounded-lg"><div className="text-xs opacity-60">Full Name</div><div className="font-bold">{scannedCard.visitor.fullName}</div></div>
                          <div className="bg-blue-50 p-3 rounded-lg"><div className="text-xs opacity-60">ID Number</div><div className="font-bold">{scannedCard.visitor.identificationNumber}</div></div>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg"><div className="text-xs opacity-60">Checked In At</div><div className="font-bold">{scannedCard.visitor.checkInTime.toDate().toLocaleString()}</div></div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 text-center bg-green-50 rounded-lg border border-green-100">
                        <BadgeCheck className="h-12 w-12 text-green-600 mb-2" />
                        <h4 className="font-bold">Unassigned Card</h4>
                        <p className="text-sm text-muted-foreground">This card is currently in stock and not assigned to a visitor.</p>
                      </div>
                    )}
                  </div>
                  <Button onClick={() => setScannedCard(null)} className="w-full">Close Information</Button>
                </DialogContent>
              </Dialog>
            )}
        </div>
    )
}

const ActiveByDivisionView = ({ allVisitors }: { allVisitors: VisitorEntry[] }) => {
  const { firestore } = useFirebase();

  // Denominator: Fetch ALL cards across all sub-collections to determine dynamic capacity per division
  const allCardsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collectionGroup(firestore, 'cards'));
  }, [firestore]);

  const { data: allCards, isLoading: cardsLoading, error: cardsError } = useCollection<IDCard>(allCardsQuery);

  const divisionStats = useMemo(() => {
    const stats: Record<string, { active: number; capacity: number }> = {};
    divisionData.forEach((d) => {
      stats[d.id] = { active: 0, capacity: 0 };
    });

    // Numerator: Active visitors currently in the division
    allVisitors.filter(v => v.status === 'IN').forEach((v) => {
      if (stats[v.divisionId]) {
        stats[v.divisionId].active++;
      }
    });

    // Denominator: Total generated ID cards available for this division
    allCards?.forEach((card) => {
      if (stats[card.divisionId]) {
        stats[card.divisionId].capacity++;
      }
    });

    return stats;
  }, [allVisitors, allCards]);

  const isLoading = cardsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Active By Division</h2>
        <p className="text-muted-foreground">Real-time occupancy across all station departments based on generated ID cards.</p>
      </div>
      
      {cardsError && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive text-sm flex items-center gap-2">
              <BadgeAlert className="h-4 w-4" /> Database Index Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs opacity-80">
              {cardsError.message.includes('index') 
                ? "This view requires a Firestore Collection Group index. Please check the browser console for the direct link to generate it." 
                : "Unable to retrieve division card counts."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {divisionData.map((div) => {
          const { active, capacity } = divisionStats[div.id];
          return (
            <Card key={div.id} className="overflow-hidden">
              <div className="h-2" style={{ backgroundColor: div.color }}></div>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold leading-tight">{div.en}</CardTitle>
                <CardDescription className="text-[10px]">{div.si}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-3xl font-black">
                    {isLoading ? '...' : active}
                  </div>
                  <div className="text-xs opacity-60">/ {isLoading ? '...' : capacity} Max Capacity</div>
                </div>
                <div className="mt-4 h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-500" 
                    style={{ 
                      width: `${capacity > 0 ? Math.min((active / capacity) * 100, 100) : 0}%`,
                      backgroundColor: div.color
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const AccessManagementView = () => {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Admin' | 'Visitor Management'>('Visitor Management');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const usersQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'users') : null), [firestore]);
  const { data: users, isLoading } = useCollection<UserProfile>(usersQuery);

  const availablePermissions = role === 'Admin' ? ADMIN_PERMISSIONS : STAFF_PERMISSIONS;

  useEffect(() => {
    setSelectedPermissions([]);
  }, [role]);

  const handleSaveUser = async () => {
    if (!firestore) return;
    if (!name || !email || (!editingUser && !password)) {
      toast({ variant: 'destructive', title: 'Missing Info', description: 'Name, Email, and Password (for new users) are required.' });
      return;
    }

    setIsSaving(true);
    try {
      let targetUid = editingUser?.id;

      if (!editingUser) {
        // Create real Auth user using secondary instance pattern
        const secondaryApp = getApps().find(app => app.name === 'Secondary') || initializeApp(firebaseConfig, 'Secondary');
        const secondaryAuth = getAuth(secondaryApp);
        
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        targetUid = userCredential.user.uid;
        
        // Sign out secondary to keep the main session intact
        await signOut(secondaryAuth);
      }

      if (!targetUid) throw new Error("Could not determine user ID");

      const userRef = doc(firestore, 'users', targetUid);
      const userData = { name, email, role, permissions: selectedPermissions };
      await setDoc(userRef, userData, { merge: true });

      toast({ title: editingUser ? 'Profile Updated' : 'Account Created Successfully' });
      setIsModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving user:', error);
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: error.message || 'Failed to save account.' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!firestore || !window.confirm('Delete this user from the database? (Note: This does not delete their Auth record)')) return;
    try {
      await deleteDoc(doc(firestore, 'users', userId));
      toast({ title: 'User Removed from Database' });
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const resetForm = () => {
    setName(''); setEmail(''); setPassword(''); setRole('Visitor Management'); setSelectedPermissions([]); setEditingUser(null);
  };

  const openEdit = (user: UserProfile) => {
    setEditingUser(user); setName(user.name); setEmail(user.email); setRole(user.role); setSelectedPermissions(user.permissions || []);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h2 className="text-2xl font-bold">Access Management</h2><p className="text-muted-foreground">Configure system users and their specific privileges.</p></div>
        <Button onClick={() => { resetForm(); setIsModalOpen(true); }}><Plus className="mr-2 h-4 w-4" /> New Account</Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow><TableHead>User Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Assigned Permissions</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8">Loading users...</TableCell></TableRow> : 
              users?.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-bold">{u.name}</TableCell>
                  <TableCell className="text-xs opacity-70">{u.email}</TableCell>
                  <TableCell><Badge variant={u.role === 'Admin' ? 'default' : 'secondary'}>{u.role}</Badge></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{u.permissions?.map(p => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}</div></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><UserCog className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteUser(u.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingUser ? 'Edit User' : 'Create Account'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><label className="text-sm font-bold">Full Name</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" /></div>
            <div className="space-y-2">
              <label className="text-sm font-bold">Email Address</label>
              <Input value={email} onChange={e => setEmail(e.target.value)} disabled={!!editingUser} placeholder="user@example.com" />
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <label className="text-sm font-bold flex items-center gap-2"><Lock className="h-4 w-4" /> Password</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                <p className="text-[10px] text-muted-foreground">Minimum 6 characters required for Auth creation.</p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-bold">System Role</label>
              <Select value={role} onValueChange={(val: any) => setRole(val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Admin">Admin</SelectItem><SelectItem value="Visitor Management">Visitor Management (Staff)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-2"><Shield className="h-4 w-4" /> Permissions for {role}</label>
              <div className="grid grid-cols-1 gap-2 border p-3 rounded-md bg-muted/30">
                {availablePermissions.map(p => (
                  <div key={p} className="flex items-center space-x-2">
                    <Checkbox id={p} checked={selectedPermissions.includes(p)} onCheckedChange={(checked) => {
                      if (checked) setSelectedPermissions([...selectedPermissions, p]);
                      else setSelectedPermissions(selectedPermissions.filter(item => item !== p));
                    }} />
                    <label htmlFor={p} className="text-sm cursor-pointer">{p}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveUser} disabled={isSaving} className="w-full">
              {isSaving ? "Processing..." : (editingUser ? 'Update Profile' : 'Create Auth Account')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const AuditTrailView = () => {
  const { firestore } = useFirebase();
  const auditQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc')) : null), [firestore]);
  const { data: logs, isLoading } = useCollection<AuditLog>(auditQuery);

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">System Audit Trail</h2><p className="text-muted-foreground">Chronological record of all critical system events.</p></div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Timestamp</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Description</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={4} className="text-center py-8">Loading logs...</TableCell></TableRow> : 
              logs?.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="text-[10px] tabular-nums">{log.timestamp ? format(log.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss') : '...'}</TableCell>
                  <TableCell className="font-bold text-xs">{log.userName}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{log.action}</Badge></TableCell>
                  <TableCell className="text-[10px] opacity-80">{log.details}</TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

const VisitorHistoryView = ({ visitors, isLoading }: any) => (
  <div className="space-y-6">
    <div><h2 className="text-2xl font-bold">Station Traffic History</h2><p className="text-muted-foreground">Comprehensive record of all station visitor movements.</p></div>
    <Card>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Visitor</TableHead><TableHead>Division</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead><TableHead>Status / Outcome</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8">Loading records...</TableCell></TableRow> : 
            visitors.map((v: any) => (
              <TableRow key={v.id}>
                <TableCell><div className="font-bold">{v.fullName}</div><div className="text-xs opacity-60">{v.identificationNumber}</div></TableCell>
                <TableCell className="text-xs">{v.divisionEnglishName}</TableCell>
                <TableCell className="text-[10px] tabular-nums">{v.checkInTime ? format(v.checkInTime.toDate(), 'MM/dd HH:mm') : '-'}</TableCell>
                <TableCell className="text-[10px] tabular-nums">{v.checkOutTime ? format(v.checkOutTime.toDate(), 'MM/dd HH:mm') : '-'}</TableCell>
                <TableCell>
                  {v.status === 'IN' ? (
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Active (Inside)</Badge>
                  ) : (
                    <Badge variant={v.outcome === 'Completed' ? 'default' : 'destructive'} className="text-[10px]">
                      {v.outcome || 'Unknown'}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))
          }
        </TableBody>
      </Table>
    </Card>
  </div>
);

type AdminView = 'dashboard' | 'active_visitors' | 'history' | 'access_management' | 'audit_trail';

const allNavItems: { id: AdminView; label: string; icon: React.ReactNode; permission: string }[] = [
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" />, permission: 'Admin Dashboard' },
    { id: 'active_visitors', label: 'Active By Division', icon: <Activity className="h-4 w-4" />, permission: 'Active Visitors by Division' },
    { id: 'history', label: 'Traffic Logs', icon: <Clock className="h-4 w-4" />, permission: 'Visitor History' },
    { id: 'access_management', label: 'Access Control', icon: <UserCog className="h-4 w-4" />, permission: 'Access Management' },
    { id: 'audit_trail', label: 'Security Logs', icon: <ScrollText className="h-4 w-4" />, permission: 'Audit Trail' }
];

export default function AdminPage() {
  const { userData, loading: authLoading } = useAuth();
  const { firestore } = useFirebase();
  const router = useRouter();

  const availableNavItems = useMemo(() => {
    if (!userData?.permissions) return [];
    return allNavItems.filter(item => userData.permissions.includes(item.permission));
  }, [userData?.permissions]);
  
  const [activeView, setActiveView] = useState<AdminView>('dashboard');

  useEffect(() => {
    if (availableNavItems.length > 0 && !availableNavItems.some(i => i.id === activeView)) {
      setActiveView(availableNavItems[0].id);
    }
  }, [availableNavItems, activeView]);

  const visitorEntriesQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'visitorEntries'), orderBy('checkInTime', 'desc')) : null), [firestore]);
  const { data: allVisitors, isLoading: visitorsLoading } = useCollection<VisitorEntry>(visitorEntriesQuery);

  useEffect(() => {
    if (!authLoading && (!userData || userData.role !== 'Admin')) {
      router.replace('/');
    }
  }, [userData, authLoading, router]);

  if (authLoading) return <div className="p-8 text-center">Authenticating...</div>;
  if (!userData) return null;

  const handleSignOut = async () => { await signOutUser(); router.replace('/'); };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView allVisitors={allVisitors || []} isLoading={visitorsLoading} />;
      case 'active_visitors': return <ActiveByDivisionView allVisitors={allVisitors || []} />;
      case 'access_management': return <AccessManagementView />;
      case 'audit_trail': return <AuditTrailView />;
      case 'history': return <VisitorHistoryView visitors={allVisitors || []} isLoading={visitorsLoading} />;
      default: return <div className="p-8">Select a view from the sidebar.</div>;
    }
  }

  const hasCardManagement = userData?.permissions?.includes('Card Management');

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-sidebar dark:bg-slate-950">
        <Sidebar className="flex flex-col bg-sidebar text-sidebar-foreground border-r">
          <SidebarHeader className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-white p-1 rounded-full shadow-sm"><Image src="/logo.png" alt="Logo" width={32} height={32} /></div>
              <div className="flex flex-col"><h1 className="text-base font-bold leading-none">VMS Admin</h1><span className="text-[9px] opacity-60 uppercase tracking-widest mt-1">Badulla Station</span></div>
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
              {hasCardManagement && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => router.push('/admin/cards')}>
                    <CreditCard className="h-4 w-4" /> <span className="ml-2 font-medium">ID Management</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t border-sidebar-border/50">
            {userData && (
              <div className="flex items-center gap-3 mb-4 p-2 rounded-lg bg-sidebar-accent/30">
                  <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center font-bold text-xs">
                    {(userData?.name?.charAt(0) || "U")}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-semibold truncate">{userData?.name}</span>
                    <span className="text-[9px] opacity-50 uppercase">{userData?.role}</span>
                  </div>
              </div>
            )}
            <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" /> End Session
            </Button>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-50">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
