import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Leaf, 
  Clock, 
  MapPin,
  Phone,
  Settings,
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  Loader2,
  RefreshCcw,
  ArrowRight
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  getDocFromServer,
  getDocs
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { CATEGORIES, MENU_ITEMS as INITIAL_MENU_ITEMS } from './constants';
import { MenuItem } from './types';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showFastingOnly, setShowFastingOnly] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  // Dynamic Restaurant Info
  const [restaurantInfo, setRestaurantInfo] = useState({
    address: "Bole Road, Near Friendship Mall",
    city: "Addis Ababa, Ethiopia",
    phone: "+251 911 234 567",
    hours: "07:00 AM - 10:00 PM"
  });
  
  // Admin State
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  
  // Edit/Add Mode
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // 1. Connection Test & Auth State
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => {
      unsubscribeAuth();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 2. Real-time Menu Data
  const seedingStarted = useRef(false);

  useEffect(() => {
    const q = collection(db, 'menu');
    const unsubscribeMenu = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as MenuItem[];
      
      // Seed data if empty (first time)
      if (items.length === 0 && !seedingStarted.current) {
        seedingStarted.current = true;
        seedDatabase();
      } else {
        setMenuItems(items);
        // Only stop loading if we aren't seeding, or if we have items
        if (!seedingStarted.current || items.length >= INITIAL_MENU_ITEMS.length) {
          setIsLoading(false);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'menu');
    });

    return () => unsubscribeMenu();
  }, []);

  // 3. Real-time Settings Data
  useEffect(() => {
    const unsubscribeInfo = onSnapshot(doc(db, 'settings', 'restaurant'), (snapshot) => {
      if (snapshot.exists()) {
        setRestaurantInfo(snapshot.data() as any);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/restaurant');
    });

    return () => unsubscribeInfo();
  }, []);

  const seedDatabase = async () => {
    try {
      for (const item of INITIAL_MENU_ITEMS) {
        const { id, ...data } = item;
        await addDoc(collection(db, 'menu'), data);
      }
    } catch (e) {
      console.error("Error seeding:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesFasting = !showFastingOnly || item.isFasting;
      return matchesCategory && matchesFasting;
    });
  }, [menuItems, selectedCategory, showFastingOnly]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'larose2024') {
      try {
        if (!user) {
          const provider = new GoogleAuthProvider();
          await signInWithPopup(auth, provider);
        }
        setIsAdmin(true);
        setShowAuthModal(false);
        setPassword('');
        setAuthError('');
      } catch (e) {
        setAuthError('Authentication failed');
      }
    } else {
      setAuthError('Incorrect password');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteDoc(doc(db, 'menu', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `menu/${id}`);
      }
    }
  };

  const handleUpdate = async (updatedItem: MenuItem) => {
    const { id, ...data } = updatedItem;
    try {
      await updateDoc(doc(db, 'menu', id), data as any);
      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `menu/${id}`);
    }
  };

  const handleAdd = async (newItem: Omit<MenuItem, 'id'>) => {
    try {
      await addDoc(collection(db, 'menu'), newItem);
      setShowAddModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'menu');
    }
  };

  const handleUpdateInfo = async (info: typeof restaurantInfo) => {
    try {
      await setDoc(doc(db, 'settings', 'restaurant'), info);
      setShowInfoModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/restaurant');
    }
  };

  const handleResetMenu = async () => {
    if (!confirm('This will delete current menu items and re-load them from defaults. Continue?')) return;
    
    setIsLoading(true);
    try {
      // 1. Delete all current items
      const q = collection(db, 'menu');
      const snapshot = await getDocs(collection(db, 'menu'));
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'menu', d.id)));
      await Promise.all(deletePromises);
      
      // 2. Secretly trigger seeding logic by setting items to empty locally
      // Actually just call seedDatabase directly
      await seedDatabase();
      alert('Menu has been reset successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'menu/reset');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && menuItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-blue/20">
        <Loader2 className="w-12 h-12 text-brand-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Admin Quick Actions Backdrop */}
      <AnimatePresence>
        {isAdmin && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-brand-primary text-white p-2 rounded-2xl shadow-2xl flex items-center gap-2 border-2 border-brand-accent/50 backdrop-blur-xl"
          >
            <div className="flex flex-col px-4 py-1 border-r border-white/10 mr-1">
              <span className="text-[10px] font-bold text-brand-accent uppercase tracking-widest">Admin Access</span>
              <span className="text-xs font-semibold opacity-80">Management Mode</span>
            </div>
            
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-brand-accent hover:bg-brand-accent/90 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95"
            >
              <Plus className="w-4 h-4" /> Add Dish
            </button>
            <button 
              onClick={() => setShowInfoModal(true)}
              className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 border border-white/5"
            >
              <Edit2 className="w-4 h-4 text-brand-accent" /> Edit Info
            </button>
            <button 
              onClick={handleResetMenu}
              className="bg-white/10 hover:bg-red-500/20 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 border border-white/5 hover:text-red-400 group"
              title="Restores menu items to default list"
            >
              <RefreshCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" /> Reset Menu
            </button>
            
            <button 
                onClick={() => setIsAdmin(false)}
                className="p-2 ml-2 text-white/50 hover:text-red-400 transition-colors"
                title="Exit Admin Mode"
            >
                <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-white/80 backdrop-blur-md shadow-sm py-4' : 'bg-transparent py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="w-12 h-12 rounded-full overflow-hidden border-2 border-brand-accent shadow-lg shadow-brand-accent/20 cursor-pointer"
            >
              <img 
                src="https://cdn.phototourl.com/member/2026-04-30-ed87b8ff-8a9c-4c2e-8120-c996cfdb4a48.jpg" 
                alt="La Vie En Rose Logo" 
                className="w-full h-full object-cover scale-110"
                referrerPolicy="no-referrer"
              />
            </motion.div>
            <span className="text-2xl font-serif font-bold tracking-tight text-brand-primary">
              La Vie <span className="text-pink-400">En</span> Rose
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-widest text-brand-primary">
            <a href="#menu" className="hover:text-brand-accent transition-colors">Menu</a>
            <a href="#contact" className="hover:text-brand-accent transition-colors">Contact</a>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-brand-primary font-semibold text-sm border-2 border-brand-accent/30 px-4 py-2 rounded-full bg-brand-blue">
              <Clock className="w-4 h-4 text-brand-accent" />
              <span>{restaurantInfo.hours}</span>
            </div>
            
            <button 
              onClick={() => isAdmin ? setIsAdmin(false) : setShowAuthModal(true)}
              className={`p-2.5 rounded-full transition-all ${
                isAdmin 
                ? 'bg-brand-accent text-white shadow-lg' 
                : 'bg-brand-blue border-2 border-brand-accent/20 text-brand-accent hover:bg-white'
              }`}
            >
              <Settings className={`w-5 h-5 ${isAdmin ? 'rotate-90' : ''} transition-transform`} />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative h-[45vh] flex items-center justify-center overflow-hidden pt-20">
        <div className="absolute inset-0 opacity-20">
           <img 
            src="https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=1920" 
            alt="Soft textures and florals" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="relative z-10 text-center px-6 max-w-4xl">
          <motion.h1 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="text-4xl md:text-7xl text-brand-primary font-serif font-medium mb-4 leading-tight"
          >
            La Vie <span className="text-pink-400 italic font-light">En</span> Rose
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-stone-500 uppercase tracking-[0.3em] font-medium text-xs md:text-sm"
          >
            A Taste of Elegance in {restaurantInfo.city}
          </motion.p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-white py-8 border-b border-stone-100 mb-8">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: 'Fresh Ingredients', value: 'Sourced Daily' },
            { label: 'Fasting Options', value: 'Dedicated Menu' },
            { label: 'Atmosphere', value: 'Soft & Serene' },
            { label: 'Location', value: restaurantInfo.city.split(',')[0] },
          ].map((stat, i) => (
            <div key={i} className="text-center md:text-left border-l-2 border-brand-blue pl-4">
              <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">{stat.label}</p>
              <p className="font-serif text-base font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Menu Section */}
      <section id="menu" className="py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-16">
            <div>
              <h2 className="text-4xl md:text-5xl font-serif mb-4">Our Menu</h2>
              <p className="text-stone-500 max-w-xl text-lg leading-relaxed font-medium">
                Our kitchen serves gourmet lunch & dinner daily from 11:30 AM to 09:45 PM. Discover our carefully curated selection of local specialties and international favorites.
              </p>
            </div>
            
            <div className="w-full lg:w-auto flex items-center">
              <button 
                onClick={() => setShowFastingOnly(!showFastingOnly)}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all border-2 whitespace-nowrap shadow-sm ${
                  showFastingOnly 
                  ? 'bg-brand-accent border-brand-accent text-white shadow-lg shadow-brand-accent/30' 
                  : 'bg-brand-blue/50 border-brand-accent/30 text-brand-primary hover:bg-brand-blue'
                }`}
              >
                <Leaf className={`w-4 h-4 ${showFastingOnly ? 'text-white' : 'text-brand-accent'}`} />
                <span>Fasting Only</span>
              </button>
            </div>
          </div>

          <div className="flex overflow-x-auto no-scrollbar gap-2 mb-12 pb-4 border-b border-stone-200/60">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-8 py-3 rounded-full text-sm font-bold whitespace-nowrap transition-all border-2 shadow-sm ${
                selectedCategory === 'all' 
                ? 'bg-brand-accent border-brand-accent text-white shadow-brand-accent/30' 
                : 'bg-brand-blue/50 border-brand-accent/20 text-brand-primary hover:bg-brand-blue'
              }`}
            >
              All selection
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-8 py-3 rounded-full text-sm font-bold whitespace-nowrap transition-all border-2 shadow-sm ${
                  selectedCategory === cat.id 
                  ? 'bg-brand-accent border-brand-accent text-white shadow-brand-accent/30' 
                  : 'bg-brand-blue/50 border-brand-accent/20 text-brand-primary hover:bg-brand-blue'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item) => (
                <MenuItemCard 
                  key={item.id} 
                  item={item} 
                  isAdmin={isAdmin} 
                  onDelete={handleDelete}
                  onEdit={(item) => setEditingItem(item)}
                />
              ))}
            </AnimatePresence>
            {filteredItems.length === 0 && (
              <div className="col-span-full py-20 text-center">
                <p className="text-stone-400 font-serif italic text-xl">
                  {menuItems.length === 0 
                    ? "Updating menu items... please wait a moment." 
                    : "No items found in this category matching your selection."}
                </p>
                {menuItems.length > 0 && (
                  <button 
                    onClick={() => { setSelectedCategory('all'); setShowFastingOnly(false); }}
                    className="mt-4 text-brand-accent font-bold hover:underline"
                  >
                    View all selection
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Auth Modal */}
      {showAuthModal && (
        <Modal onClose={() => setShowAuthModal(false)} title="Admin Access">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-stone-400">Password</label>
              <input 
                type="password" 
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-stone-100 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none"
                placeholder="Enter password"
              />
              {authError && <p className="text-red-500 text-xs font-medium">{authError}</p>}
            </div>
            <button type="submit" className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all">
              Unlock Dashboard
            </button>
          </form>
        </Modal>
      )}

      {/* Info Editor Modal */}
      {showInfoModal && (
        <Modal onClose={() => setShowInfoModal(false)} title="Business Info">
           <form onSubmit={(e) => { e.preventDefault(); handleUpdateInfo(restaurantInfo); }} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Street Address</label>
              <input 
                className="w-full px-4 py-3 bg-stone-50 rounded-xl border border-stone-200 outline-none focus:border-brand-accent font-medium text-brand-primary"
                value={restaurantInfo.address}
                onChange={e => setRestaurantInfo({...restaurantInfo, address: e.target.value})}
                required
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">City, Country</label>
              <input 
                className="w-full px-4 py-3 bg-stone-50 rounded-xl border border-stone-200 outline-none focus:border-brand-accent font-medium text-brand-primary"
                value={restaurantInfo.city}
                onChange={e => setRestaurantInfo({...restaurantInfo, city: e.target.value})}
                required
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Phone Number</label>
              <input 
                className="w-full px-4 py-3 bg-stone-50 rounded-xl border border-stone-200 outline-none focus:border-brand-accent font-medium text-brand-primary"
                value={restaurantInfo.phone}
                onChange={e => setRestaurantInfo({...restaurantInfo, phone: e.target.value})}
                required
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Opening Hours</label>
              <input 
                className="w-full px-4 py-3 bg-stone-50 rounded-xl border border-stone-200 outline-none focus:border-brand-accent font-medium text-brand-primary"
                value={restaurantInfo.hours}
                onChange={e => setRestaurantInfo({...restaurantInfo, hours: e.target.value})}
                required
              />
            </div>
            <button type="submit" className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 mt-4 shadow-xl">
              <Check className="w-5 h-5" /> Update Business Info
            </button>
          </form>
        </Modal>
      )}

      {/* Edit/Add Modals */}
      {(editingItem || showAddModal) && (
        <MenuEditorModal 
          item={editingItem || undefined} 
          onSave={(item) => editingItem ? handleUpdate(item) : handleAdd(item)}
          onClose={() => { setEditingItem(null); setShowAddModal(false); }}
        />
      )}

      {/* Footer */}
      <footer id="contact" className="bg-white py-24 border-t border-stone-200">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-16">
          <div>
            <div className="flex items-center gap-2 mb-8">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-brand-accent/30 shadow-md shadow-brand-accent/10">
                <img 
                  src="https://cdn.phototourl.com/member/2026-04-30-ed87b8ff-8a9c-4c2e-8120-c996cfdb4a48.jpg" 
                  alt="Logo" 
                  className="w-full h-full object-cover scale-110"
                  referrerPolicy="no-referrer"
                />
              </div>
              <span className="text-xl font-serif font-bold text-brand-primary">
                La Vie <span className="text-pink-400">En</span> Rose
              </span>
            </div>
            <p className="text-stone-500 mb-8 leading-relaxed">
              Excellence in dining. We pride ourselves on delivering a fusion 
              of traditional Ethiopian flavors and contemporary international cuisine.
            </p>
          </div>

          <div>
            <h3 className="text-sm uppercase tracking-widest text-stone-400 mb-8 font-sans font-semibold text-brand-accent">Location & Contact</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <MapPin className="w-5 h-5 text-brand-accent mt-0.5" />
                <p className="text-stone-600 leading-relaxed font-medium">
                  {restaurantInfo.address} <br />
                  {restaurantInfo.city}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Phone className="w-5 h-5 text-brand-accent" />
                <p className="text-stone-600 font-bold">{restaurantInfo.phone}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm uppercase tracking-widest text-stone-400 mb-8 font-sans font-semibold text-brand-accent">Opening Hours</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-stone-600 font-medium">
                <span>All Day</span>
                <span className="text-brand-primary font-bold">{restaurantInfo.hours}</span>
              </div>
              <div className="pt-4 text-xs text-stone-400 italic">
                * Open 7 days a week, including holidays.
              </div>
            </div>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6 mt-24 pt-8 border-t border-stone-100 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-stone-400">
          <p>&copy; {new Date().getFullYear()} La Vie En Rose. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

interface MenuItemCardProps {
  item: MenuItem;
  isAdmin: boolean;
  onDelete: (id: string) => Promise<void> | void;
  onEdit: (item: MenuItem) => void;
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({ 
  item, 
  isAdmin, 
  onDelete,
  onEdit 
}) => {
  const imageUrl = `https://images.unsplash.com/photo-${1500000000000 + (parseInt(item.id.replace(/\D/g, '')) || 500) % 1000}?auto=format&fit=crop&q=60&w=400`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.4 }}
      className="group relative flex flex-col h-full bg-brand-blue/40 backdrop-blur-sm rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border-2 border-brand-accent/20 hover:border-brand-accent/50"
    >
      <div className="aspect-[4/3] overflow-hidden relative border-b-2 border-brand-accent/10">
        <img 
          src={imageUrl} 
          alt={item.name} 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400";
          }}
        />
        <div className="absolute top-4 right-4 bg-brand-blue/90 border border-brand-accent/30 backdrop-blur-sm px-3 py-1 rounded-full flex flex-col items-center">
            <span className="font-sans font-bold text-brand-primary text-sm tracking-tight leading-none">
              {item.price.toLocaleString()}
            </span>
            <span className="text-[8px] uppercase tracking-widest font-bold text-brand-accent">Birr</span>
        </div>
        {item.isFasting && (
          <div className="absolute top-4 left-4 bg-brand-accent text-white p-1.5 rounded-full shadow-lg">
             <Leaf className="w-3.5 h-3.5" />
          </div>
        )}
        
        {isAdmin && (
          <div className="absolute inset-0 bg-brand-primary/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 z-20">
            <button 
              onClick={() => onEdit(item)}
              className="w-12 h-12 bg-white text-brand-primary rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-xl"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button 
              onClick={() => onDelete(item.id)}
              className="w-12 h-12 bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-xl"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      <div className="p-6 flex flex-col flex-grow">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg md:text-xl font-serif font-bold text-brand-primary group-hover:text-brand-accent transition-colors leading-snug">
            {item.name}
          </h3>
        </div>
        
        <p className="text-brand-primary/80 text-sm leading-relaxed mb-6 line-clamp-3 font-medium">
          {item.description}
        </p>
        
        <div className="mt-auto pt-4 border-t border-brand-accent/20 flex justify-between items-center">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-accent">
            {item.category}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-brand-primary/40 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-serif font-bold text-brand-primary italic">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-all">
              <X className="w-6 h-6 text-stone-400" />
            </button>
          </div>
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function MenuEditorModal({ 
  item, 
  onSave, 
  onClose 
}: { 
  item?: MenuItem; 
  onSave: (item: any) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState<Omit<MenuItem, 'id'>>(
    item ? { 
      name: item.name, 
      description: item.description, 
      price: item.price, 
      category: item.category, 
      isFasting: !!item.isFasting 
    } : {
      name: '',
      description: '',
      price: 0,
      category: 'mains',
      isFasting: false
    }
  );

  return (
    <Modal onClose={onClose} title={item ? "Edit Dish" : "Add New Dish"}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ ...formData, id: item?.id }); }} className="space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Name</label>
          <input 
            className="w-full px-4 py-3 bg-stone-50 rounded-xl border border-stone-200 outline-none focus:border-brand-accent font-medium"
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
            required
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Description</label>
          <textarea 
            className="w-full px-4 py-3 bg-stone-50 rounded-xl border border-stone-200 outline-none focus:border-brand-accent font-medium h-24"
            value={formData.description}
            onChange={e => setFormData({...formData, description: e.target.value})}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Price (Birr)</label>
            <input 
              type="number"
              className="w-full px-4 py-3 bg-stone-50 rounded-xl border border-stone-200 outline-none focus:border-brand-accent font-bold"
              value={formData.price}
              onChange={e => setFormData({...formData, price: Number(e.target.value)})}
              required
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Category</label>
            <select 
              className="w-full px-4 py-3 bg-stone-50 rounded-xl border border-stone-200 outline-none focus:border-brand-accent font-bold h-[50px]"
              value={formData.category}
              onChange={e => setFormData({...formData, category: e.target.value})}
            >
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <input 
            type="checkbox"
            id="isFasting"
            checked={formData.isFasting}
            onChange={e => setFormData({...formData, isFasting: e.target.checked})}
            className="w-5 h-5 accent-emerald-500"
          />
          <label htmlFor="isFasting" className="text-sm font-semibold text-stone-600 cursor-pointer">Fasting Friendly</label>
        </div>
        <button className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 mt-4 shadow-xl shadow-brand-primary/10">
          <Check className="w-5 h-5" /> {item ? 'Save Changes' : 'Add to Menu'}
        </button>
      </form>
    </Modal>
  );
}
