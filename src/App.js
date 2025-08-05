// App.js

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wallet, Mnemonic, isAddress, parseEther, formatEther, JsonRpcProvider, Contract,
  formatUnits, parseUnits, Interface
} from "ethers";
import { Toaster, toast } from "react-hot-toast";
import clsx from "clsx";
import QRCode from "react-qr-code";
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
    return [...pendingWithStatus, ...confirmedFiltered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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
          setWalletName(""); setPassword(""); setConfirmPw(""); setMode('fetch');
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
          setWalletName(""); setPassword(""); setConfirmPw(""); setMnemonicInput(""); setMode('fetch');
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
          setWalletData(data);
          localStorage.setItem('walletData', JSON.stringify(data));
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

  const logTransaction = async (hash) => {
    try {
      await fetch(`${API_URL}/api/tx/${hash}`, { method: "POST" });
    } catch (e) { console.error("Auto-logging failed for tx:", hash, e); }
  };

  const handleSend = async () => {
    if (!walletData) { return toast.error("Load wallet first."); }
    if (!isAddress(recipient)) { return toast.error("Invalid recipient address."); }
    if (!amount || parseFloat(amount) <= 0) { return toast.error("Invalid amount."); }
    setLoading(true);
    const toastId = toast.loading(`Submitting transaction...`);
    try {
        const wallet = new Wallet(walletData.privateKey, provider);
        const nonce = await provider.getTransactionCount(wallet.address, "pending");
        let txRequest;
        if (sendToken === "BNB") {
            txRequest = { to: recipient, value: parseEther(amount), nonce: nonce };
        } else {
            const contractAddress = sendToken === "USDT" ? USDT_CONTRACT_ADDRESS : USDC_CONTRACT_ADDRESS;
            const tokenContract = new Contract(contractAddress, ERC20_ABI, wallet);
            const decimals = await tokenContract.decimals();
            const data = tokenContract.interface.encodeFunctionData("transfer", [recipient, parseUnits(amount, decimals)]);
            txRequest = { to: contractAddress, data: data, nonce: nonce };
        }
        const tx = await wallet.sendTransaction(txRequest);
        const pendingTxData = { hash: tx.hash, from: wallet.address.toLowerCase(), to: recipient.toLowerCase(), amount: amount, tokenName: sendToken, timestamp: new Date().toISOString(), nonce: tx.nonce, gasPrice: tx.gasPrice.toString(), };
        setPendingTxs(prev => [pendingTxData, ...prev]);
        toast.success(<span><b>Transaction Submitted!</b><br/>It is now pending in your history.</span>, { id: toastId, duration: 6000 });
        setAmount(""); 
        setRecipient("");
        setActiveTab('history');
        tx.wait().then(async (receipt) => {
            console.log('Transaction confirmed:', receipt.hash);
            toast.success(<span><b>Transaction Confirmed!</b><br/><a href={`https://testnet.bscscan.com/tx/${receipt.hash}`} target="_blank" rel="noopener noreferrer">View on BscScan</a></span>);
            await logTransaction(receipt.hash);
            setPendingTxs(prev => prev.filter(p => p.hash !== receipt.hash));
            fetchAllBalances(wallet.address);
            fetchHistory();
        }).catch(err => {
            console.error("Transaction failed or was dropped:", err);
            if (err.reason !== 'transaction replaced') {
              toast.error("Transaction failed. It may have been dropped.");
            }
            setPendingTxs(prev => prev.filter(p => p.hash !== tx.hash));
        });
    } catch (e) {
        console.error(e);
        toast.error(e.reason || e.message || "Failed to submit transaction", { id: toastId });
    } finally {
        setLoading(false);
    }
  };

  const handleCancel = async (txToCancel) => {
    if (!window.confirm("Are you sure you want to cancel this transaction? This will cost a small gas fee.")) { return; }
    const toastId = toast.loading("Submitting cancellation...");
    setLoading(true);
    try {
        const wallet = new Wallet(walletData.privateKey, provider);
        const feeData = await provider.getFeeData();
        const newGasPrice = (feeData.gasPrice * 12n) / 10n;
        const cancelTx = await wallet.sendTransaction({ to: wallet.address, value: 0, nonce: txToCancel.nonce, gasPrice: newGasPrice });
        toast.success(<span><b>Cancellation submitted!</b><br/>Waiting for confirmation...</span>, { id: toastId });
        cancelTx.wait().then(receipt => {
            toast.success("Original transaction successfully cancelled!");
            setPendingTxs(prev => prev.filter(p => p.nonce !== txToCancel.nonce));
            fetchAllBalances(wallet.address);
        });
    } catch (error) {
        console.error("Cancellation failed:", error);
        toast.error(error.reason || "Cancellation failed. The transaction may have already been confirmed.", { id: toastId });
    } finally {
        setLoading(false);
    }
  };

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
    // 1. Validate the inputs: Check if the name is not empty and the address is valid.
    if (!newContactName.trim() || !isAddress(newContactAddress)) {
      return toast.error("Please enter a valid name and address.");
    }

    // 2. Create the payload object to send to the backend.
    const payload = {
      walletAddress: walletData.address,
      contactName: newContactName.trim(),
      contactAddress: newContactAddress.trim()
    };

    try {
      // 3. Send the new contact data to the backend using a POST request.
      const res = await fetch(`${API_URL}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // 4. Check if the server responded with an error.
      if (!res.ok) {
        // If there's an error, try to parse the error message from the server's response.
        throw new Error((await res.json()).error || 'Failed to add contact');
      }

      // 5. If successful, show a success message.
      toast.success("Contact added!");
      
      // 6. Clear the input fields.
      setNewContactName("");
      setNewContactAddress("");
      
      // 7. Refresh the contacts list to show the new addition.
      fetchContacts();

    } catch (e) {
      // 8. If any part of the process fails, show the error message.
      toast.error(e.message);
    }
  };

  const handleDeleteContact = async (contactId) => {
    // 1. Ask the user for confirmation before deleting.
    // window.confirm() shows a simple browser pop-up. If the user clicks "Cancel", it returns false.
    if (!window.confirm("Are you sure you want to delete this contact?")) {
      return; // Stop the function if the user cancels.
    }

    try {
      // 2. Send a DELETE request to the backend, targeting the specific contact by its ID.
      const res = await fetch(`${API_URL}/api/contacts/${contactId}`, {
        method: 'DELETE'
      });

      // 3. Check for any errors from the server.
      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to delete contact');
      }

      // 4. If successful, show a success message.
      toast.success("Contact deleted.");
      
      // 5. Refresh the contacts list to reflect the deletion.
      fetchContacts();
      
    } catch (e) {
      // 6. If anything fails, show the error message.
      toast.error(e.message);
    }
  };

  // This effect handles estimating the gas fee.
  useEffect(() => {
    const estimateFee = async () => {
      if (!walletData || !isAddress(recipient) || !amount || parseFloat(amount) <= 0) {
        setEstimatedFee(null);
        return;
      }
      setFeeLoading(true);
      try {
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice;
        let gasLimit;
        if (sendToken === "BNB") {
            gasLimit = await provider.estimateGas({ to: recipient, value: parseEther(amount) });
        } else {
            const contractAddress = sendToken === "USDT" ? USDT_CONTRACT_ADDRESS : USDC_CONTRACT_ADDRESS;
            const tokenInterface = new Interface(ERC20_ABI);
            const decimals = await new Contract(contractAddress, ERC20_ABI, provider).decimals();
            const data = tokenInterface.encodeFunctionData("transfer", [recipient, parseUnits(amount, decimals)]);
            gasLimit = await provider.estimateGas({ to: contractAddress, from: walletData.address, data });
        }
        setEstimatedFee(formatEther(gasPrice * gasLimit));
      } catch (error) {
        console.error("Fee estimation failed:", error.reason || error.message);
        setEstimatedFee(null);
      } finally {
        setFeeLoading(false);
      }
    };
    const debounce = setTimeout(() => { estimateFee() }, 500);
    return () => clearTimeout(debounce);
  }, [amount, recipient, sendToken, provider, walletData]);

  // This effect handles fetching data when tabs are switched.
  useEffect(() => {
    if (walletData) {
        if (activeTab === "history") { fetchHistory(); }
        if (activeTab === "contacts") { fetchContacts(); }
    }
  }, [activeTab, walletData, fetchHistory, fetchContacts]);

  // This effect runs ONCE on app load to check for a saved session.
  useEffect(() => {
    const savedData = localStorage.getItem('walletData');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setWalletData(parsedData);
        fetchAllBalances(parsedData.address);
      } catch (error) {
        localStorage.removeItem('walletData');
      }
    }
  }, [fetchAllBalances]);

  if (!walletData) {
    const getTitle = () => {
      if (mode === 'create') return "Create a New Wallet";
      if (mode === 'import') return "Import Existing Wallet";
      if (mode === 'reset') return "Reset Your Password";
      return "Access Your Wallet";
    };
    const getButtonText = () => {
      if (mode === 'create') return "Create & Secure Wallet";
      if (mode === 'import') return "Import & Secure Wallet";
      if (mode === 'reset') return "Reset Password";
      return "Access My Wallet";
    };
    const mainAction = mode === 'reset' ? handlePasswordReset : handleSubmit;

    return (
        <div className="app-pre-login">
            <Toaster position="top-center" toastOptions={{ className: 'toast-custom' }}/>
            <div className="login-box">
                <h1 className="title">🦊 CryptoNest</h1>
                <p className="subtitle">{getTitle()}</p>
                {mode !== 'reset' && (
                  <div className="pill-toggle">
                      <span className={clsx({ active: mode === "create" })} onClick={() => setMode("create")}>Create</span>
                      <span className={clsx({ active: mode === "fetch" })} onClick={() => setMode("fetch")}>Access</span>
                      <span className={clsx({ active: mode === "import" })} onClick={() => setMode("import")}>Import</span>
                  </div>
                )}
                <div className="input-group">
                    <input placeholder="Wallet Name (case-insensitive)" value={walletName} onChange={(e) => setWalletName(e.target.value)} />
                    {(mode === 'import' || mode === 'reset') && (
                      <textarea className="mnemonic-input" placeholder="Enter your 12-word Mnemonic Phrase..." value={mnemonicInput} onChange={(e) => setMnemonicInput(e.target.value)} rows={3}/>
                    )}
                    <input type="password" placeholder={mode === 'reset' ? 'Enter New Password' : 'Password'} value={password} onChange={(e) => setPassword(e.target.value)}/>
                    {(mode !== 'fetch') && (
                      <input type="password" placeholder={mode === 'reset' ? 'Confirm New Password' : 'Confirm Password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}/>
                    )}
                </div>
                <button className="btn btn-primary" onClick={mainAction} disabled={loading}>
                    {loading ? <LoadingSpinner /> : getButtonText()}
                </button>
                <div className="login-footer-links">
                  {mode === 'fetch' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('reset'); }}>Forgot Password?</a>}
                  {(mode === 'reset' || mode === 'import') && <a href="#" onClick={(e) => { e.preventDefault(); setMode('fetch'); }}>Back to Login</a>}
                </div>
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
            <button className="btn btn-secondary" style={{width: 'auto'}} onClick={() => { setWalletData(null); setPassword(''); localStorage.removeItem('walletData'); }}>Lock Wallet</button>
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
                                <div className="input-group">
                                    <label>Amount</label>
                                    <input placeholder="0.0" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                                </div>
                                <div className="input-group">
                                    <label>Token</label>
                                    <select value={sendToken} onChange={(e) => setSendToken(e.target.value)}>
                                        <option value="BNB">BNB</option>
                                        <option value="USDT">USDT</option>
                                        <option value="USDC">USDC</option>
                                    </select>
                                </div>
                            </div>
                            <button className="btn btn-primary" onClick={handleSend} disabled={loading || !recipient || !amount}>
                                {loading ? <LoadingSpinner /> : `Send ${sendToken}`}
                            </button>
                            <div className="fee-display">
                                <span>Estimated Fee:</span>
                                <span>{isFeeLoading ? "Calculating..." : estimatedFee ? `~${parseFloat(estimatedFee).toFixed(6)} BNB` : "N/A"}</span>
                            </div>
                        </Card>
                    )}

                    {activeTab === 'history' && (
                       <Card>
                         {(historyLoading && displayedHistory.length === 0) ? <LoadingSpinner /> : (
                           <ul className="history-list">
                             {displayedHistory.length > 0 ? displayedHistory.map(tx => {
                                const isSent = tx.from.toLowerCase() === walletData.address.toLowerCase();
                                const txDate = new Date(tx.timestamp);
                                const isPending = tx.status === 'Pending';
                                return (
                                  <li key={tx.hash} className={clsx({ 'tx-status-pending': isPending })}>
                                    <div className="tx-icon-and-details"><div className={clsx('tx-direction', {sent: isSent, received: !isSent})}>{isSent ? '↗' : '↙'}</div><div className="tx-details"><p><strong>{isSent ? `Send ${tx.tokenName}` : `Receive ${tx.tokenName}`}</strong></p>{isPending ? <p className="status-text pending">Pending</p> : <p className="tx-sub-details">{`${txDate.toLocaleDateString()} at ${txDate.toLocaleTimeString()}`}</p>}</div></div>
                                    <div className="tx-amount-and-actions"><p className="tx-amount">{`${isSent ? '-' : '+'} ${parseFloat(tx.amount).toFixed(4)} ${tx.tokenName}`}</p>{isPending ? <button className="btn-cancel" onClick={() => handleCancel(tx)} disabled={loading}>Cancel</button> : <a href={`https://testnet.bscscan.com/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="tx-link">View</a>}</div>
                                  </li>
                                )
                             }) : <p>No transactions found.</p>}
                           </ul>
                         )}
                       </Card>
                    )}

                    {activeTab === 'contacts' && ( <Card title="Address Book"><div className="add-contact-form"><h4>Add New Contact</h4><div className="input-group"><input placeholder="Contact Name" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} /></div><div className="input-group"><input placeholder="Contact Address (0x...)" value={newContactAddress} onChange={(e) => setNewContactAddress(e.target.value)} /></div><button className="btn btn-secondary" onClick={handleAddContact}>Save Contact</button></div><div className="contacts-list"><h4>Saved Contacts</h4>{contacts.length > 0 ? (<ul>{contacts.map(contact => (<li key={contact._id}><div className="contact-info"><strong>{contact.contactName}</strong><span>{contact.contactAddress}</span></div><button className="btn-delete" onClick={() => handleDeleteContact(contact._id)}>🗑️</button></li>))}</ul>) : <p>You have no saved contacts.</p>}</div></Card> )}

                    {activeTab === 'security' && (
                        <Card title="Reveal Private key & Mnemonic">
                            <p className="warning-text">Only do this if you know what you are doing. Never share these with anyone.</p>
                            <div className="input-group">
                                <label>Enter Your Wallet Password</label>
                                <input type="password" placeholder="********" value={revealInput} onChange={(e) => setRevealInput(e.target.value)} />
                            </div>
                            <button className="btn btn-danger" onClick={() => { if (showSensitive) { setShowSensitive(false); } else { if (revealInput === walletData.password) { setShowSensitive(true); toast.success("Secrets Revealed!"); } else if (revealInput) { toast.error("Incorrect password!"); } } setRevealInput(""); }}>
                                {showSensitive ? "Hide Secrets" : "Reveal Secrets"}
                            </button>
                            {showSensitive && (
                                <div className="secrets-box">
                                    <div className="input-group"><label>Private Key</label><textarea readOnly value={walletData.privateKey} rows={2} /></div>
                                    <div className="input-group"><label>Mnemonic Phrase</label><textarea readOnly value={walletData.mnemonic} rows={3} /></div>
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