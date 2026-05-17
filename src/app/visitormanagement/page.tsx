
'use client';

import { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  LogIn,
  LogOut,
  Clock,
  Users,
  Check,
  X,
  Search,
  BookUser,
  Scan,
  QrCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { divisionData } from '@/lib/divisions';
import type { VisitorEntry, UserProfile, IDCard } from '@/lib/types';
import { logAuditAction } from '@/lib/audit';
import {
  useFirebase,
  useCollection,
  useMemoFirebase,
  WithId,
  signOutUser,
} from '@/firebase';
import { collection, Timestamp, doc, query, where, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { QRScanner } from '@/components/qr-scanner';
import { decryptQRData } from '@/lib/qr-security';

// --- Validation Schemas ---
const checkInSchema = z
  .object({
    identificationType: z.string().min(1, 'ID type is required.'),
    identificationNumber: z.string().min(1, 'ID number is required.'),
    fullName: z.string().min(2, 'Full name must be at least 2 characters.'),
    gender: z.string().min(1, 'Gender is required.'),
    address: z.string().min(5, 'Address must be at least 5 characters.'),
    allocatedCardId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const { identificationType, identificationNumber } = data;
    if (identificationType === 'None') return; 
    if (identificationType === 'NIC') {
      const nicRegex = /(^\d{9}[VX]$)|(^\d{12}$)/;
      if (!nicRegex.test(identificationNumber.toUpperCase())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid NIC. Expected 9 digits + V/X or 12 digits.', path: ['identificationNumber'] });
      }
    }
    if (identificationType === 'Driving License') {
      const dlRegex = /^B\d{7}$/;
      if (!dlRegex.test(identificationNumber.toUpperCase())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Driving License. Expected format: B1234567.', path: ['identificationNumber'] });
      }
    }
    if (identificationType === 'Passport') {
      const passportRegex = /^[A-Z]{1,2}\d{7,9}$/;
      if (!passportRegex.test(identificationNumber.toUpperCase())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Passport. Expected 1-2 letters and 7-9 digits.', path: ['identificationNumber'] });
      }
    }
  });

type CheckInFormValues = z.infer<typeof checkInSchema>;
type Tab = 'in' | 'out' | 'history';

export default function VisitorManagementPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !userData)) {
      router.replace('/');
    }
  }, [user, userData, loading, router]);

  if (loading) return <div className="flex items-center justify-center h-screen"><p>Loading...</p></div>;
  if (!user || !userData) return null;

  return <VisitorManagementLayout userProfile={userData} />;
}

function VisitorManagementLayout({ userProfile }: { userProfile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<Tab>('in');
  const [activeSearch, setActiveSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('week');
  const { firestore } = useFirebase();

  const visitorEntriesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'visitorEntries') : null), [firestore]);
  const { data: allVisitors, isLoading: visitorsLoading } = useCollection<VisitorEntry>(visitorEntriesQuery);
  
  const availableNavItems = useMemo(() => {
    const allItems = [
        { id: 'in', permission: 'Check-In' },
        { id: 'out', permission: 'Active' },
        { id: 'history', permission: 'History' },
    ];
    return allItems.filter(item => userProfile.permissions?.includes(item.permission));
  }, [userProfile?.permissions]);

  useEffect(() => {
    if (availableNavItems.length > 0 && !availableNavItems.some(item => item.id === activeTab)) {
      setActiveTab(availableNavItems[0].id as Tab);
    }
  }, [availableNavItems, activeTab]);

  const activeVisitors = useMemo(() => allVisitors?.filter((v) => v.status === 'IN') || [], [allVisitors]);

  const filteredActiveVisitors = useMemo(() => {
    if (!activeSearch) return activeVisitors;
    const term = activeSearch.toLowerCase();
    return activeVisitors.filter(v => v.fullName.toLowerCase().includes(term) || v.identificationNumber.toLowerCase().includes(term) || (v.allocatedCardId || '').toLowerCase().includes(term));
  }, [activeVisitors, activeSearch]);

  const renderContent = () => {
    switch (activeTab) {
      case 'in': return <CheckInView getActiveCount={(id) => activeVisitors.filter(v => v.divisionId === id).length} userProfile={userProfile} />;
      case 'out': return <ActiveVisitorsView visitors={filteredActiveVisitors} isLoading={visitorsLoading} searchValue={activeSearch} onSearchChange={setActiveSearch} userProfile={userProfile} />;
      case 'history': return <HistoryView visitors={allVisitors?.filter(v => v.status === 'OUT') || []} isLoading={visitorsLoading} searchValue={historySearch} onSearchChange={setHistorySearch} filter={historyFilter} onFilterChange={setHistoryFilter} />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} userProfile={userProfile} />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto relative">{renderContent()}</div>
      </main>
    </div>
  );
}

const Navbar = ({ activeTab, setActiveTab, userProfile }: { activeTab: Tab; setActiveTab: (tab: Tab) => void; userProfile: UserProfile }) => {
  const router = useRouter();
  const allNavItems = [
    { id: 'in', label: 'Check-In', icon: <LogIn />, permission: 'Check-In' },
    { id: 'out', label: 'Active', icon: <Users />, permission: 'Active' },
    { id: 'history', label: 'History', icon: <Clock />, permission: 'History' },
  ];
  const availableNavItems = allNavItems.filter(item => userProfile.permissions?.includes(item.permission));

  return (
    <nav className="bg-sidebar text-sidebar-foreground shadow-lg z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Logo" width={40} height={40} />
            <h1 className="text-lg font-bold">Visitor Management</h1>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {availableNavItems.map(item => (
              <Button key={item.id} variant="ghost" onClick={() => setActiveTab(item.id as Tab)} className={activeTab === item.id ? 'bg-sidebar-accent' : ''}>
                {item.icon} <span className="ml-2">{item.label}</span>
              </Button>
            ))}
            {userProfile.role === 'Admin' && (
              <Button variant="ghost" onClick={() => router.push('/admin')}>
                <BookUser /> <span className="ml-2">Admin Panel</span>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-bold">{userProfile.name}</span>
              <span className="text-[10px] opacity-70 uppercase">Badulla Police Station</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOutUser().then(() => router.replace('/'))}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

const CheckInView = ({ getActiveCount, userProfile }: { getActiveCount: (id: string) => number; userProfile: UserProfile }) => {
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [tempVisitorData, setTempVisitorData] = useState<any>();
  const { toast } = useToast();
  const { firestore } = useFirebase();
  const [availableCards, setAvailableCards] = useState<IDCard[]>([]);

  useEffect(() => {
    async function fetchCards() {
      if (!firestore || !selectedDivisionId) { setAvailableCards([]); return; }
      const q = query(
        collection(firestore, 'generated_id_cards', selectedDivisionId, 'cards'), 
        where('status', '==', 'available')
      );
      const snapshot = await getDocs(q);
      setAvailableCards(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IDCard)));
    }
    fetchCards();
  }, [firestore, selectedDivisionId]);

  const form = useForm<CheckInFormValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: { identificationType: '', identificationNumber: '', fullName: '', gender: '', address: '', allocatedCardId: '' },
  });

  const handleQRScan = (decodedText: string) => {
    const decrypted = decryptQRData(decodedText);
    if (!decrypted.includes('verify-police-vms')) {
      toast({ variant: 'destructive', title: 'Invalid Card', description: 'This QR code is not recognized by our system.' });
      return;
    }
    const [cardId, divisionId] = decrypted.split('|');
    if (divisionId !== selectedDivisionId) {
      toast({ variant: 'destructive', title: 'Wrong Division', description: `This card belongs to ${divisionData.find(d => d.id === divisionId)?.en}.` });
      return;
    }
    form.setValue('allocatedCardId', cardId);
    setIsScanning(false);
    toast({ title: 'Card Linked', description: `Card No: ${cardId} has been selected.` });
  };

  const onSubmit = (values: CheckInFormValues) => {
    if (!selectedDivisionId) { toast({ variant: 'destructive', title: 'Required', description: 'Select a division first.' }); return; }
    setTempVisitorData({ ...values, divisionId: selectedDivisionId });
    setIsModalOpen(true);
  };

  const confirmCheckIn = async () => {
    if (!firestore || !tempVisitorData) return;
    const division = divisionData.find(d => d.id === tempVisitorData.divisionId)!;
    
    try {
      const newVisitorRef = doc(collection(firestore, 'visitorEntries'));
      const visitorId = newVisitorRef.id;

      const newEntry = {
        ...tempVisitorData,
        checkInTime: Timestamp.now(),
        status: 'IN',
        divisionEnglishName: division.en,
        divisionSinhalaName: division.si,
        divisionBackgroundColorHex: division.color,
        divisionTextColorHex: division.text,
      };

      await setDoc(newVisitorRef, newEntry);
      
      if (tempVisitorData.allocatedCardId) {
        await updateDoc(doc(firestore, 'generated_id_cards', tempVisitorData.divisionId, 'cards', tempVisitorData.allocatedCardId), {
          status: 'allocated',
          currentVisitorId: visitorId
        });
      }

      logAuditAction(firestore, userProfile.name, 'Visitor Check-In', `Visitor: ${newEntry.fullName}, Card: ${newEntry.allocatedCardId || 'None'}`);
      
      setIsModalOpen(false);
      form.reset({ identificationType: '', identificationNumber: '', fullName: '', gender: '', address: '', allocatedCardId: '' });
      setSelectedDivisionId(null);
      toast({ title: 'Success', description: 'Visitor checked in successfully.' });
    } catch (error: any) {
      console.error('Check-in error details:', error);
      toast({ variant: 'destructive', title: 'Check-In Failed', description: error.message || 'Something went wrong.' });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>Visitor Information</CardTitle></CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="identificationType" render={({ field }) => (
                <FormItem><FormLabel>ID Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="NIC">NIC</SelectItem><SelectItem value="Passport">Passport</SelectItem><SelectItem value="Driving License">DL</SelectItem><SelectItem value="None">None</SelectItem></SelectContent></Select></FormItem>
              )} />
              <FormField control={form.control} name="identificationNumber" render={({ field }) => (
                <FormItem><FormLabel>ID Number</FormLabel><FormControl><Input {...field} disabled={form.watch('identificationType') === 'None'} className="uppercase" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="fullName" render={({ field }) => (
                <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem><FormLabel>Gender</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></FormItem>
              )} />
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="allocatedCardId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex justify-between items-center">Card Allocation <Button type="button" variant="ghost" size="sm" onClick={() => setIsScanning(true)} disabled={!selectedDivisionId}><QrCode className="h-4 w-4 mr-1"/> Scan</Button></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder={availableCards.length ? "Select card..." : "No cards available"} /></SelectTrigger></FormControl>
                    <SelectContent>{availableCards.map(c => <SelectItem key={c.id} value={c.cardId}>{c.cardId}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Review & Check In</Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Select Division</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {divisionData.map(div => (
            <div key={div.id} onClick={() => setSelectedDivisionId(div.id)} className={`p-4 rounded-xl cursor-pointer border-2 transition-all ${selectedDivisionId === div.id ? 'ring-2 ring-blue-500 scale-[1.02]' : 'hover:bg-muted'}`} style={{ backgroundColor: div.color, color: div.text }}>
              <div className="font-bold">{div.en}</div>
              <div className="text-xs opacity-80">{div.si}</div>
              <div className="mt-4 flex justify-between items-center bg-black/10 p-2 rounded-lg">
                <span className="text-[10px] uppercase font-bold">Inside</span>
                <span className="font-bold">{getActiveCount(div.id)} / {div.max}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {isScanning && (
        <Dialog open={isScanning} onOpenChange={setIsScanning}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Scan ID Card</DialogTitle><DialogDescription>Hold the visitor card QR code up to your camera.</DialogDescription></DialogHeader>
            <QRScanner onScanSuccess={handleQRScan} />
            <DialogFooter><Button variant="secondary" onClick={() => setIsScanning(false)}>Cancel</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isModalOpen && tempVisitorData && <VerificationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={confirmCheckIn} visitorData={tempVisitorData} />}
    </div>
  );
};

const VerificationModal = ({ isOpen, onClose, onConfirm, visitorData }: any) => {
  const division = divisionData.find(d => d.id === visitorData.divisionId)!;
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent style={{ backgroundColor: division.color, color: division.text }} className="text-white max-w-md">
        <DialogHeader><DialogTitle>Confirm Entry</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-black/10 p-3 rounded-lg"><div className="text-xs opacity-70">Division</div><div className="font-bold">{division.en}</div></div>
          <div className="bg-black/10 p-3 rounded-lg"><div className="text-xs opacity-70">Visitor</div><div className="font-bold">{visitorData.fullName}</div></div>
          <div className="bg-black/10 p-3 rounded-lg"><div className="text-xs opacity-70">Card No</div><div className="font-bold">{visitorData.allocatedCardId || 'None'}</div></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="bg-white/10 hover:bg-white/20">Edit</Button>
          <Button onClick={onConfirm} className="bg-white text-primary font-bold">Confirm & Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ActiveVisitorsView = ({ visitors, isLoading, searchValue, onSearchChange, userProfile }: any) => {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);

  const handleQRScan = (decodedText: string) => {
    const decrypted = decryptQRData(decodedText);
    if (!decrypted.includes('verify-police-vms')) return;
    const [cardId] = decrypted.split('|');
    const visitor = visitors.find((v: any) => v.allocatedCardId === cardId);
    if (!visitor) {
      toast({ variant: 'destructive', title: 'Not Found', description: `No active visitor found for card ${cardId}.` });
      return;
    }
    setIsScanning(false);
    onSearchChange(cardId);
    toast({ title: 'Card Identified', description: `Visitor: ${visitor.fullName}` });
  };

  const handleCheckOut = async (v: WithId<VisitorEntry>, taskStatus: 'Completed' | 'Incomplete') => {
    if (!firestore) return;
    await updateDoc(doc(firestore, 'visitorEntries', v.id), { status: 'OUT', checkOutTime: Timestamp.now(), taskStatus });
    if (v.allocatedCardId) {
      await updateDoc(doc(firestore, 'generated_id_cards', v.divisionId, 'cards', v.allocatedCardId), { status: 'available', currentVisitorId: null });
    }
    logAuditAction(firestore, userProfile.name, 'Visitor Check-Out', `Visitor: ${v.fullName}, Status: ${taskStatus}`);
    toast({ title: 'Visitor Checked Out' });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div><CardTitle>Active Visitors</CardTitle><CardDescription>Currently inside the station.</CardDescription></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsScanning(true)}><Scan className="h-4 w-4 mr-2"/> Scan to Identify</Button>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name or card..." value={searchValue} onChange={(e) => onSearchChange(e.target.value)} className="pl-8" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Visitor</TableHead><TableHead>Division</TableHead><TableHead>Card</TableHead><TableHead>Check-In</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow> : 
              visitors.map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell><div className="font-bold">{v.fullName}</div><div className="text-xs text-muted-foreground">{v.identificationNumber}</div></TableCell>
                  <TableCell><Badge style={{ backgroundColor: v.divisionBackgroundColorHex, color: v.divisionTextColorHex }}>{v.divisionEnglishName}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{v.allocatedCardId || 'None'}</Badge></TableCell>
                  <TableCell>{v.checkInTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleCheckOut(v, 'Completed')}><Check className="h-4 w-4 mr-1"/> Done</Button>
                    <Button size="sm" variant="outline" onClick={() => handleCheckOut(v, 'Incomplete')}><X className="h-4 w-4 mr-1"/> Pending</Button>
                  </TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </CardContent>
      {isScanning && (
        <Dialog open={isScanning} onOpenChange={setIsScanning}>
          <DialogContent><DialogHeader><DialogTitle>Identify Visitor</DialogTitle><DialogDescription>Scan the visitor's card to find their record.</DialogDescription></DialogHeader>
            <QRScanner onScanSuccess={handleQRScan} />
            <DialogFooter><Button variant="ghost" onClick={() => setIsScanning(false)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
};

const HistoryView = ({ visitors, isLoading, searchValue, onSearchChange }: any) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between">
      <div><CardTitle>Visitor History</CardTitle><CardDescription>Past check-ins and logs.</CardDescription></div>
      <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search records..." value={searchValue} onChange={(e) => onSearchChange(e.target.value)} className="pl-8" />
      </div>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader><TableRow><TableHead>Visitor</TableHead><TableHead>Gender</TableHead><TableHead>Division</TableHead><TableHead>Time In</TableHead><TableHead>Time Out</TableHead><TableHead>Task</TableHead></TableRow></TableHeader>
        <TableBody>
          {visitors.map((v: any) => (
            <TableRow key={v.id}>
              <TableCell><div className="font-bold">{v.fullName}</div><div className="text-xs text-muted-foreground">{v.identificationNumber}</div></TableCell>
              <TableCell>{v.gender}</TableCell>
              <TableCell>{v.divisionEnglishName}</TableCell>
              <TableCell>{v.checkInTime.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
              <TableCell>{v.checkOutTime?.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
              <TableCell><Badge variant={v.taskStatus === 'Completed' ? 'default' : 'destructive'}>{v.taskStatus}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);
