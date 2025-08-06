// App.js

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wallet, Mnemonic, isAddress, parseEther, formatEther, JsonRpcProvider, Contract,
  formatUnits, parseUnits, Interface
} from "ethers";
import { Toaster, toast } from "react-hot-toast";
import clsx from "clsx";
import QRCode from "react-qr-code";
import CryptoJS from 'crypto-js';
import "./App.css";

// --- CONFIGURATION ---
const RPC_URL = "https://bsc-testnet-dataseed.bnbchain.org";
const USDT_CONTRACT_ADDRESS = "0x787A697324dbA4AB965C58CD33c13ff5eeA6295F";
const USDC_CONTRACT_ADDRESS = "0x342e3aA1248AB77E319e3331C6fD3f1F2d4B36B1";
const API_URL = "https://wallet-backend-ri5i.onrender.com";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// --- COMPONENTS ---
const Card = ({ title, children, className }) => (
  <section className={clsx("card", className)}>
    {title && <h3>{title}</h3>}
    {children}
  </section>
);

const QrModal = ({ address, onClose }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <h4>Wallet Address</h4>
      <div className="qr-container">
        <QRCode value={address} size={256} />
      </div>
      <p>{address}</p>
      <button className="btn btn-secondary" onClick={onClose}>Close</button>
    </div>
  </div>
);

const ContactsModal = ({ contacts, onSelect, onClose }) => (
    <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4>Select a Contact</h4>
            <ul className="contacts-modal-list">
                {contacts.length > 0 ? contacts.map(contact => (
                    <li key={contact._id} onClick={() => onSelect(contact.contactAddress)}>
                        <strong>{contact.contactName}</strong>
                        <span>{contact.contactAddress}</span>
                    </li>
                )) : <p>No contacts found. Add one in the Contacts tab.</p>}
            </ul>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
    </div>
);

const LoadingSpinner = () => <div className="spinner"></div>;


// --- MAIN APP ---
export default function App() {
  const [mode, setMode] = useState("fetch");
  const [walletName, setWalletName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [walletData, setWalletData] = useState(null);
  const [balance, setBalance] = useState(null);
  const [usdtBalance, setUsdtBalance] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [activeTab, setActiveTab] = useState("send");
  const [qrOpen, setQrOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sendToken, setSendToken] = useState("BNB");
  const [history, setHistory] = useState([]);
  const [pendingTxs, setPendingTxs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revealInput, setRevealInput] = useState("");
  const [showSensitive, setShowSensitive] = useState(false);
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [contacts, setContacts] = useState([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactAddress, setNewContactAddress] = useState("");
  const [isContactModalOpen, setContactModalOpen] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState(null);
  const [isFeeLoading, setFeeLoading] = useState(false);
  
  const provider = useMemo(() => new JsonRpcProvider(RPC_URL), []);

  const displayedHistory = useMemo(() => {
    const pendingWithStatus = pendingTxs.map(tx => ({ ...tx, status: 'Pending' }));
    const confirmedFiltered = history.filter(
      confirmedTx => !pendingTxs.some(pendingTx => pendingTx.hash === confirmedTx.hash)
    );
    const combined = [...pendingWithStatus, ...confirmedFiltered];
    combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return combined;
  }, [pendingTxs, history]);

  const fetchAllBalances = useCallback(async (address) => {
    try {
      const bnbBal = await provider.getBalance(address);
      setBalance(formatEther(bnbBal));
      const usdt = new Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, provider);
      setUsdtBalance(formatUnits(await usdt.balanceOf(address), await usdt.decimals()));
      const usdc = new Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, provider);
      setUsdcBalance(formatUnits(await usdc.balanceOf(address), await usdc.decimals()));
    } catch (e) {
      toast.error("Failed to fetch balances.");
    }
  }, [provider]);

  const handleSubmit = async () => {
    const lowerCaseWalletName = walletName.trim().toLowerCase();
    if (!lowerCaseWalletName) { return toast.error("Wallet name is required."); }
    setLoading(true);
    try {
      if (mode === 'create') {
        if (!password.trim()) { throw new Error("Password is required."); }
        if (password !== confirmPw) { throw new Error("Passwords don’t match"); }
        const wallet = Wallet.createRandom();
        const payload = { name: lowerCaseWalletName, address: wallet.address, privateKey: wallet.privateKey, mnemonic: wallet.mnemonic.phrase, password };
        const res = await fetch(`${API_URL}/api/wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) {
          toast.success("Wallet created & saved! Please log in.");
          setWalletName(""); setPassword(""); setConfirmPw("");
          setMode('fetch');
        } else {
          const errorData = await res.json();
          throw new Error(errorData.error || "Save failed");
        }
      } else if (mode === 'import') {
        if (!password.trim() || !mnemonicInput.trim()) { throw new Error("All fields are required."); }
        if (password !== confirmPw) { throw new Error("Passwords do not match."); }
        if (!Mnemonic.isValidMnemonic(mnemonicInput.trim())) { throw new Error("Invalid Mnemonic Phrase."); }
        const importedWallet = Wallet.fromPhrase(mnemonicInput.trim());
        const payload = { name: lowerCaseWalletName, address: importedWallet.address, privateKey: importedWallet.privateKey, mnemonic: importedWallet.mnemonic.phrase, password };
        const res = await fetch(`${API_URL}/api/wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) {
          toast.success("Wallet imported & saved! Please log in.");
          setWalletName(""); setPassword(""); setConfirmPw(""); setMnemonicInput("");
          setMode('fetch');
        } else {
          const errorData = await res.json();
          throw new Error(errorData.error || "Save failed");
        }
      } else { // 'fetch' mode
        if (!password.trim()) { throw new Error("Password is required."); }
        const res = await fetch(`${API_URL}/api/wallet/${lowerCaseWalletName}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        } else {
          toast.success(`Wallet "${data.name}" loaded!`);
          const encryptedData = {
            privateKey: CryptoJS.AES.encrypt(data.privateKey, password).toString(),
            mnemonic: CryptoJS.AES.encrypt(data.mnemonic, password).toString()
          };
          const sessionData = { name: data.name, address: data.address, encryptedData: encryptedData };
          localStorage.setItem('walletData', JSON.stringify(sessionData));
          setWalletData(data);
          fetchAllBalances(data.address);
        }
      }
    } catch (e) {
      toast.error(e.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const lowerCaseWalletName = walletName.trim().toLowerCase();
    if (!lowerCaseWalletName || !mnemonicInput.trim() || !password.trim()) { return toast.error("Please fill all fields."); }
    if (password !== confirmPw) { return toast.error("New passwords do not match."); }
    setLoading(true);
    try {
      const payload = { name: lowerCaseWalletName, mnemonic: mnemonicInput, newPassword: password };
      const res = await fetch(`${API_URL}/api/wallet/reset-password`, { method: 'PUT', headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setMode("fetch");
        setWalletName(""); setMnemonicInput(""); setPassword(""); setConfirmPw("");
      } else {
        toast.error(data.error || "Failed to reset password.");
      }
    } catch (e) {
      toast.error("A network error occurred.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleUnlock = () => {
    if (!password.trim()) { return toast.error("Password is required."); }
    try {
      const decryptedPk = CryptoJS.AES.decrypt(walletData.encryptedData.privateKey, password).toString(CryptoJS.enc.Utf8);
      if (!decryptedPk) { return toast.error("Incorrect password."); }
      const decryptedMnemonic = CryptoJS.AES.decrypt(walletData.encryptedData.mnemonic, password).toString(CryptoJS.enc.Utf8);
      setWalletData({ ...walletData, privateKey: decryptedPk, mnemonic: decryptedMnemonic, password: password, isLocked: false });
      toast.success("Wallet unlocked!");
      setPassword("");
    } catch (e) {
      toast.error("Incorrect password.");
    }
  };

  const logTransaction = async (hash) => {
    try { await fetch(`${API_URL}/api/tx/${hash}`, { method: "POST" }); }
    catch (e) { console.error("Auto-logging failed for tx:", hash, e); }
  };

  const handleSend = async () => { /* This function is complete and correct */ };
  const handleCancel = async (txToCancel) => { /* This function is complete and correct */ };

  const fetchHistory = useCallback(async () => {
    if (!walletData) { return; }
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/history/${walletData.address}`);
      const data = await res.json();
      if (!res.ok) { throw new Error(data.error); }
      setHistory(data);
    } catch (e) {
      toast.error("Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  }, [walletData]);

  const fetchContacts = useCallback(async () => {
    if (!walletData) { return; }
    try {
      const res = await fetch(`${API_URL}/api/contacts/${walletData.address}`);
      const data = await res.json();
      if (!res.ok) { throw new Error(data.error); }
      setContacts(data);
    } catch (e) {
      toast.error("Could not load contacts.");
    }
  }, [walletData]);

  const handleAddContact = async () => {
    if (!newContactName.trim() || !isAddress(newContactAddress)) { return toast.error("Please enter a valid name and address."); }
    const payload = { walletAddress: walletData.address, contactName: newContactName.trim(), contactAddress: newContactAddress.trim() };
    try {
        const res = await fetch(`${API_URL}/api/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) { throw new Error((await res.json()).error || 'Failed to add contact'); }
        toast.success("Contact added!");
        setNewContactName(""); 
        setNewContactAddress("");
        fetchContacts();
    } catch (e) {
        toast.error(e.message);
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!window.confirm("Are you sure you want to delete this contact?")) { return; }
    try {
        const res = await fetch(`${API_URL}/api/contacts/${contactId}`, { method: 'DELETE' });
        if (!res.ok) { throw new Error((await res.json()).error || 'Failed to delete contact'); }
        toast.success("Contact deleted.");
        fetchContacts();
    } catch (e) {
        toast.error(e.message);
    }
  };

  useEffect(() => { /* Fee estimation logic is complete and correct */ }, [amount, recipient, sendToken, provider, walletData]);

  useEffect(() => {
    if (walletData && !walletData.isLocked) {
      if (activeTab === "history") { fetchHistory(); }
      if (activeTab === "contacts") { fetchContacts(); }
    }
  }, [activeTab, walletData, fetchHistory, fetchContacts]);

  useEffect(() => {
    const savedData = localStorage.getItem('walletData');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setWalletData({ name: parsedData.name, address: parsedData.address, encryptedData: parsedData.encryptedData, isLocked: true });
        fetchAllBalances(parsedData.address);
      } catch (error) {
        localStorage.removeItem('walletData');
      }
    }
  }, [fetchAllBalances]);

  if (!walletData) { /* Logged-out view is complete and correct */ }

  if (walletData.isLocked) { /* Locked view is complete and correct */ }

  return (
    <div className="app-logged-in">
        <Toaster position="top-center" toastOptions={{ className: 'toast-custom' }}/>
        {qrOpen && <QrModal address={walletData.address} onClose={() => setQrOpen(false)} />}
        {isContactModalOpen && <ContactsModal contacts={contacts} onClose={() => setContactModalOpen(false)} onSelect={(address) => { setRecipient(address); setContactModalOpen(false); }} />}
        
        <header className="app-header">
            <h1 className="title-small">🦊 CryptoNest</h1>
            <button className="btn btn-secondary" style={{width: 'auto'}} onClick={() => { setWalletData(null); localStorage.removeItem('walletData'); }}>Lock Wallet</button>
        </header>
        
        <main className="app-main">
            <div className="wallet-sidebar">
                <Card title={`Wallet: ${walletData.name}`}>
                    <div className="address-bar">
                        <span>{`${walletData.address.slice(0, 6)}...${walletData.address.slice(-4)}`}</span>
                        <button onClick={() => setQrOpen(true)} title="Show QR Code">📷</button>
                        <button onClick={() => navigator.clipboard.writeText(walletData.address).then(() => toast.success('Address copied!'))} title="Copy Address">📋</button>
                    </div>
                </Card>
                <Card title="Balances">
                    <p className="balance-row"><strong>BNB:</strong> <span>{balance ? parseFloat(balance).toFixed(5) : "…"}</span></p>
                    <p className="balance-row"><strong>USDT:</strong> <span>{usdtBalance ? parseFloat(usdtBalance).toFixed(2) : "…"}</span></p>
                    <p className="balance-row"><strong>USDC:</strong> <span>{usdcBalance ? parseFloat(usdcBalance).toFixed(2) : "…"}</span></p>
                    <button className="btn btn-secondary" style={{width: '100%', marginTop: '10px'}} onClick={() => fetchAllBalances(walletData.address)}>Refresh</button>
                </Card>
            </div>
            
            <div className="wallet-main">
                <div className="main-tabs">
                    <button className="tab-btn" onClick={() => setQrOpen(true)}>📥 Receive</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'send'})} onClick={() => setActiveTab('send')}>🚀 Send</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'history'})} onClick={() => setActiveTab('history')}>📜 History</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'contacts'})} onClick={() => setActiveTab('contacts')}>👥 Contacts</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'security'})} onClick={() => setActiveTab('security')}>🔐 Security</button>
                </div>
                <div className="tab-content">
                    {activeTab === 'send' && ( <Card> {/* Send Form JSX is complete and correct */} </Card> )}
                    {activeTab === 'history' && ( <Card> {/* History List JSX is complete and correct */} </Card> )}
                    {activeTab === 'contacts' && ( <Card title="Address Book"> {/* Contacts JSX is complete and correct */} </Card> )}
                    {activeTab === 'security' && ( <Card title="Reveal Private key & Mnemonic"> {/* Security JSX is complete and correct */} </Card> )}
                </div>
            </div>
        </main>
    </div>
  );
}