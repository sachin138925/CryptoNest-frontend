// App.js

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wallet, isAddress, parseEther, formatEther, JsonRpcProvider, Contract,
  formatUnits, parseUnits, Interface, Mnemonic
} from "ethers";
import { Toaster, toast } from "react-hot-toast";
import clsx from "clsx";
import QRCode from "react-qr-code";
import "./App.css";

// --- CONFIGURATION ---
const RPC_URL = "https://bsc-testnet-dataseed.bnbchain.org";
const API_URL = "https://wallet-backend-ri5i.onrender.com";
const USDT_CONTRACT_ADDRESS = "0x787A697324dbA4AB965C58CD33c13ff5eeA6295F";
const USDC_CONTRACT_ADDRESS = "0x342e3aA1248AB77E319e3331C6fD3f1F2d4B36B1";

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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revealInput, setRevealInput] = useState("");
  const [showSensitive, setShowSensitive] = useState(false);
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [contacts, setContacts] = useState([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactAddress, setNewContactAddress] = useState("");
  const [isContactModalOpen, setContactModalOpen] = useState(false);
  
  const provider = useMemo(() => new JsonRpcProvider(RPC_URL), []);

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

  const handleAction = async () => {
    if (mode === "create") {
      if (!walletName.trim() || !password.trim()) return toast.error("Fill all fields");
      if (password !== confirmPw) return toast.error("Passwords don’t match");
      setLoading(true);
      try {
        const wallet = Wallet.createRandom();
        const payload = { name: walletName, address: wallet.address, privateKey: wallet.privateKey, mnemonic: wallet.mnemonic.phrase, password };
        const res = await fetch(`${API_URL}/api/wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) {
          toast.success("Wallet created & saved!");
          setWalletName(""); setPassword(""); setConfirmPw(""); setMode("fetch");
        } else {
          const { error } = await res.json();
          toast.error(error || "Save failed");
        }
      } catch (err) { toast.error("A network error occurred."); } finally { setLoading(false); }
    } else if (mode === 'import') {
      if (!walletName.trim() || !password.trim() || !mnemonicInput.trim()) return toast.error("Please fill all fields.");
      if (password !== confirmPw) return toast.error("Passwords do not match.");
      if (!Wallet.isValidMnemonic(mnemonicInput.trim())) return toast.error("Invalid Mnemonic Phrase.");
      setLoading(true);
      try {
        const importedWallet = Wallet.fromMnemonic(mnemonicInput.trim());
        const payload = { name: walletName, address: importedWallet.address, privateKey: importedWallet.privateKey, mnemonic: importedWallet.mnemonic.phrase, password };
        const res = await fetch(`${API_URL}/api/wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) {
          toast.success("Wallet imported and saved!");
          setWalletName(""); setPassword(""); setConfirmPw(""); setMnemonicInput(""); setMode("fetch");
        } else {
          const { error } = await res.json();
          toast.error(error || "Save failed.");
        }
      } catch (err) { toast.error("A network error occurred."); } finally { setLoading(false); }
    } else { // fetch mode
      if (!walletName.trim() || !password.trim()) return toast.error("Fill all fields");
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/wallet/${walletName}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
        const data = await res.json();
        if (data.error) {
          toast.error(data.error);
        } else {
          toast.success(`Wallet "${data.name}" loaded!`);
          setWalletData(data);
        }
      } catch (e) {
        toast.error("A network error occurred.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSend = async () => {
    if (!walletData) return toast.error("Load wallet first.");
    if (!isAddress(recipient)) return toast.error("Invalid recipient address.");
    if (!amount || parseFloat(amount) <= 0) return toast.error("Invalid amount.");

    setLoading(true);
    const toastId = toast.loading(`Submitting transaction...`);
    try {
        const signer = new Wallet(walletData.privateKey, provider);
        let tx;
        if (sendToken === "BNB") {
            tx = await signer.sendTransaction({ to: recipient, value: parseEther(amount) });
        } else {
            const contractAddress = sendToken === "USDT" ? USDT_CONTRACT_ADDRESS : USDC_CONTRACT_ADDRESS;
            const tokenContract = new Contract(contractAddress, ERC20_ABI, signer);
            const decimals = await tokenContract.decimals();
            tx = await tokenContract.transfer(recipient, parseUnits(amount, decimals));
        }
        toast.success(<span><b>Transaction Submitted!</b><br/>Waiting for confirmation...</span>, { id: toastId, duration: 6000 });
        await tx.wait();
        toast.success(<span><b>Transaction Confirmed!</b><br/><a href={`https://testnet.bscscan.com/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">View on BscScan</a></span>, { id: toastId, duration: 8000 });
        setAmount(""); setRecipient("");
        fetchAllBalances(walletData.address);
        fetchHistory();
    } catch (e) {
        toast.error(e?.reason || e?.message || "Failed to submit transaction", { id: toastId });
    } finally {
        setLoading(false);
    }
  };

  const fetchHistory = useCallback(async () => {
    if (!walletData) return;
    setHistoryLoading(true);
    try {
      const bnbPromise = fetch(`https://api-testnet.bscscan.com/api?module=account&action=txlist&address=${walletData.address}&startblock=0&endblock=99999999&sort=desc&apikey=YourApiKeyToken`);
      const tokenPromise = fetch(`https://api-testnet.bscscan.com/api?module=account&action=tokentx&address=${walletData.address}&startblock=0&endblock=99999999&sort=desc&apikey=YourApiKeyToken`);
      const [bnbRes, tokenRes] = await Promise.all([bnbPromise, tokenPromise]);
      const [bnbData, tokenData] = await Promise.all([bnbRes.json(), tokenRes.json()]);

      const combined = [
          ...bnbData.result.map(tx => ({ ...tx, type: 'bnb' })),
          ...tokenData.result.map(tx => ({ ...tx, type: 'token' }))
      ].sort((a,b) => b.timeStamp - a.timeStamp).slice(0, 20); // Limit to latest 20 txs
      
      setHistory(combined);
    } catch (e) {
      toast.error("Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  }, [walletData]);
  
  const fetchContacts = useCallback(async () => {
    if (!walletData) return;
    try {
      const res = await fetch(`${API_URL}/api/contacts/${walletData.address}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setContacts(data);
    } catch (e) {
      toast.error("Could not load contacts.");
    }
  }, [walletData]);

  const handleAddContact = async () => {
    if (!newContactName.trim() || !isAddress(newContactAddress)) return toast.error("Please enter a valid name and address.");
    const payload = { walletAddress: walletData.address, contactName: newContactName, contactAddress: newContactAddress };
    try {
        const res = await fetch(`${API_URL}/api/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to add contact');
        toast.success("Contact added!");
        setNewContactName(""); setNewContactAddress("");
        fetchContacts();
    } catch (e) {
        toast.error(e.message);
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!window.confirm("Are you sure you want to delete this contact?")) return;
    try {
        const res = await fetch(`${API_URL}/api/contacts/${contactId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete contact');
        toast.success("Contact deleted.");
        fetchContacts();
    } catch (e) {
        toast.error(e.message);
    }
  };

  useEffect(() => {
    if (walletData) {
      fetchAllBalances(walletData.address);
      if (activeTab === "history") fetchHistory();
      if (activeTab === "contacts") fetchContacts();
    } else {
      setBalance(null); setUsdtBalance(null); setUsdcBalance(null);
      setHistory([]); setContacts([]);
    }
  }, [activeTab, walletData, fetchAllBalances, fetchHistory, fetchContacts]);

  if (!walletData) {
    const getTitle = () => {
      if (mode === 'create') return "Create a New Wallet";
      if (mode === 'import') return "Import Existing Wallet";
      return "Access Your Wallet";
    };
    const getButtonText = () => {
      if (mode === 'create') return "Create & Secure Wallet";
      if (mode === 'import') return "Import & Secure Wallet";
      return "Access My Wallet";
    };

    return (
        <div className="app-pre-login">
            <Toaster position="top-center" toastOptions={{ className: 'toast-custom' }}/>
            <div className="login-box">
                <h1 className="title">🦊 CryptoNest</h1>
                <div className="pill-toggle">
                    <span className={clsx({ active: mode === "create" })} onClick={() => setMode("create")}>Create</span>
                    <span className={clsx({ active: mode === "fetch" })} onClick={() => setMode("fetch")}>Access</span>
                    <span className={clsx({ active: mode === "import" })} onClick={() => setMode("import")}>Import</span>
                </div>
                <p className="subtitle">{getTitle()}</p>
                <div className="input-group">
                    {mode === 'import' && <textarea className="mnemonic-input" placeholder="Enter your 12-word Mnemonic Phrase..." value={mnemonicInput} onChange={(e) => setMnemonicInput(e.target.value)} rows={3}/>}
                    {(mode === 'create' || mode === 'import' || mode === 'fetch') && <input placeholder="Wallet Name" value={walletName} onChange={(e) => setWalletName(e.target.value)} />}
                    <input type="password" placeholder={'Password'} value={password} onChange={(e) => setPassword(e.target.value)}/>
                    {(mode === "create" || mode === 'import') && <input type="password" placeholder={'Confirm Password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}/>}
                </div>
                <button className="btn btn-primary" onClick={handleAction} disabled={loading}>
                    {loading ? <LoadingSpinner /> : getButtonText()}
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="app-logged-in">
        <Toaster position="top-center" toastOptions={{ className: 'toast-custom' }}/>
        {qrOpen && <QrModal address={walletData.address} onClose={() => setQrOpen(false)} />}
        {isContactModalOpen && <ContactsModal contacts={contacts} onClose={() => setContactModalOpen(false)} onSelect={(address) => { setRecipient(address); setContactModalOpen(false); }} />}
        
        <header className="app-header">
            <h1 className="title-small">🦊 CryptoNest</h1>
            <button className="btn btn-secondary" style={{width: 'auto'}} onClick={() => { setWalletData(null); setPassword('')}}>Lock Wallet</button>
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
                    <button className={clsx('tab-btn', {active: activeTab === 'send'})} onClick={() => setActiveTab('send')}>🚀 Send</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'history'})} onClick={() => setActiveTab('history')}>📜 History</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'contacts'})} onClick={() => setActiveTab('contacts')}>👥 Contacts</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'security'})} onClick={() => setActiveTab('security')}>🔐 Security</button>
                </div>
                <div className="tab-content">
                    {activeTab === 'send' && (
                        <Card>
                            <div className="input-group">
                                <label>Recipient Address</label>
                                <div className="address-input-wrapper">
                                    <input placeholder="0x..." value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                                    <button className="btn-address-book" onClick={() => { if(contacts.length === 0) fetchContacts(); setContactModalOpen(true); }}>👥</button>
                                </div>
                            </div>
                            <div className="input-group-row">
                                <div className="input-group"><label>Amount</label><input placeholder="0.0" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                                <div className="input-group"><label>Token</label><select value={sendToken} onChange={(e) => setSendToken(e.target.value)}><option value="BNB">BNB</option><option value="USDT">USDT</option><option value="USDC">USDC</option></select></div>
                            </div>
                            <button className="btn btn-primary" onClick={handleSend} disabled={loading || !recipient || !amount}>{loading ? <LoadingSpinner /> : `Send ${sendToken}`}</button>
                        </Card>
                    )}

                    {activeTab === 'history' && (
                       <Card>
                         {historyLoading ? <LoadingSpinner /> : (
                           <ul className="history-list">
                             {history.length > 0 ? history.map(tx => {
                                const isSent = tx.from.toLowerCase() === walletData.address.toLowerCase();
                                const txDate = new Date(tx.timeStamp * 1000);
                                const isTokenTx = tx.type === 'token';
                                const tokenName = isTokenTx ? tx.tokenSymbol : 'BNB';
                                const txValue = isTokenTx ? formatUnits(tx.value, tx.tokenDecimal) : formatEther(tx.value);
                                return (
                                  <li key={tx.hash}>
                                    <div><strong>{isSent ? `Send ${tokenName}` : `Receive ${tokenName}`}</strong><p>{txDate.toLocaleDateString()}</p></div>
                                    <div><p>{`${isSent ? '-' : '+'} ${parseFloat(txValue).toFixed(4)}`}</p><a href={`https://testnet.bscscan.com/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">View</a></div>
                                  </li>
                                )
                             }) : <p>No transaction history.</p>}
                           </ul>
                         )}
                       </Card>
                    )}

                    {activeTab === 'contacts' && (
                        <Card title="Address Book">
                            <div className="add-contact-form">
                                <h4>Add New Contact</h4>
                                <div className="input-group"><input placeholder="Contact Name" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} /></div>
                                <div className="input-group"><input placeholder="Contact Address (0x...)" value={newContactAddress} onChange={(e) => setNewContactAddress(e.target.value)} /></div>
                                <button className="btn btn-secondary" onClick={handleAddContact}>Save</button>
                            </div>
                            <div className="contacts-list">
                                <h4>Saved Contacts</h4>
                                {contacts.length > 0 ? (<ul>{contacts.map(c => (<li key={c._id}><div><strong>{c.contactName}</strong><span>{c.contactAddress}</span></div><button onClick={() => handleDeleteContact(c._id)}>🗑️</button></li>))}</ul>) : <p>No contacts.</p>}
                            </div>
                        </Card>
                    )}

                    {activeTab === 'security' && (
                        <Card title="Reveal Private key & Mnemonic">
                            <p className="warning-text">Never share these with anyone.</p>
                            <div className="input-group">
                                <label>Enter Your Wallet Password</label>
                                <input type="password" value={revealInput} onChange={(e) => setRevealInput(e.target.value)} />
                            </div>
                            <button
                              className="btn btn-danger"
                              onClick={() => {
                                if (showSensitive) { setShowSensitive(false); }
                                else if (revealInput === walletData.password) { setShowSensitive(true); } 
                                else if (revealInput) { toast.error("Incorrect password!"); }
                                setRevealInput("");
                              }}
                            >
                                {showSensitive ? "Hide Secrets" : "Reveal Secrets"}
                            </button>
                            {showSensitive && (
                                <div className="secrets-box">
                                    <div className="input-group"><label>Private Key</label><textarea readOnly value={walletData.privateKey} /></div>
                                    <div className="input-group"><label>Mnemonic Phrase</label><textarea readOnly value={walletData.mnemonic} /></div>
                                </div>
                            )}
                        </Card>
                    )}
                </div>
            </div>
        </main>
    </div>
  );
}