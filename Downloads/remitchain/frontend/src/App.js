import React, { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";


// CONTRACT ADDRESSES — UPDATE AFTER DEPLOYING V3

const ADDRESSES = {
  USDC: "0x05106d7dA0B4414361D43F0c1F6994D339d168c4",
  GBPT: "0xd18714298e9854B853fc9F11919aCAa42BE0BC47",
  EURT: "0x4459A9e2D0E8b66C9AAC935fF8557cf9C37D47ea",
  INRT: "0xD0206D7343364206E16627baE56d3B796A655ac5",
  JPYC: "0x91CB17EE982ee22A5aF48Fec3D95c77609235Eb7",
  FeedUsdUsd: "0x80FF98090Cd55d6bfde5a7119c5A15f50452583A",
  FeedUsdGbp: "0xFFcc37D62256bdD64bEcbE5ec42f92Ce992A0716",
  FeedUsdEur: "0xdfFE5028316e303815CbE70D2BB68035BCe072d0",
  FeedUsdInr: "0xc09160032D676cE090dFd9C6aB4aCFA419C13a6F",
  FeedUsdJpy: "0xdfFE5028316e303815CbE70D2BB68035BCe072d0",
  RemitChain: "0x473D57AE4CAdb3388075F8cFA4E7032a13AF2dA4",
};

// Currency config
const CURRENCIES = {
  USD: { symbol: "$", name: "US Dollar Token", flag: "🇺🇸", token: "USDC", addr: () => ADDRESSES.USDC },
  GBP: { symbol: "£", name: "British Pound Token", flag: "🇬🇧", token: "GBPT", addr: () => ADDRESSES.GBPT },
  EUR: { symbol: "€", name: "Euro Token", flag: "🇪🇺", token: "EURT", addr: () => ADDRESSES.EURT },
  INR: { symbol: "₹", name: "Indian Rupee Token", flag: "🇮🇳", token: "INRT", addr: () => ADDRESSES.INRT },
  JPY: { symbol: "¥", name: "Japanese Yen Token", flag: "🇯🇵", token: "JPYC", addr: () => ADDRESSES.JPYC },
};

const PAIRS = {
  "USD/USD": { feed: () => ADDRESSES.FeedUsdUsd, from: "USD", to: "USD" },
  "USD/GBP": { feed: () => ADDRESSES.FeedUsdGbp, from: "USD", to: "GBP" },
  "USD/EUR": { feed: () => ADDRESSES.FeedUsdEur, from: "USD", to: "EUR" },
  "USD/INR": { feed: () => ADDRESSES.FeedUsdInr, from: "USD", to: "INR" },
  "USD/JPY": { feed: () => ADDRESSES.FeedUsdJpy, from: "USD", to: "JPY" },
};

const STATUS_MAP = ["Pending", "Claimed", "Finalized", "Completed", "Reversed", "Refunded"];

// ABIs
const ERC20_ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

const REMITCHAIN_ABI = [
  "function addSupportedToken(address _token, string calldata _currency) external",
  "function setPriceFeed(string calldata _pair, address _feed) external",
  "function initiateTransfer(address _recipient, address _sourceToken, address _destinationToken, uint256 _amount, string calldata _currencyPair) external",
  "function claimTransfer(uint256 _transferId) external",
  "function reverseTransfer(uint256 _transferId) external",
  "function withdrawTransfer(uint256 _transferId) external",
  "function refundTransfer(uint256 _transferId) external",
  "function pauseContract(string calldata _reason) external",
  "function unpauseContract() external",
  "function paused() external view returns (bool)",
  "function getQuote(uint256 _amount, string calldata _currencyPair) external view returns (uint256 destinationAmount, uint256 fee)",
  "function getTransferDetails(uint256 _transferId) external view returns (tuple(uint256 id, address sender, address recipient, address sourceToken, address destinationToken, uint256 sourceAmount, uint256 destinationAmount, uint256 fee, uint256 exchangeRate, string currencyPair, uint8 status, uint256 createdAt, uint256 claimedAt, uint256 completedAt))",
  "function transferCount() external view returns (uint256)",
  "function owner() external view returns (address)",
  "function gracePeriod() external view returns (uint256)",
  "event NotifyRecipient(address indexed recipient, uint256 indexed transferId, string message, uint256 amount, string currency)",
  "event NotifySender(address indexed sender, uint256 indexed transferId, string message)",
];

const PRICEFEED_ABI = [
  "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
];

export default function App() {
  const [account, setAccount] = useState("");
  const [contracts, setContracts] = useState({});
  const [isOwner, setIsOwner] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const [activeTab, setActiveTab] = useState("send");
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("GBP");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [quote, setQuote] = useState(null);
  const [balances, setBalances] = useState({});
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHistory, setTxHistory] = useState([]);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [notifications, setNotifications] = useState([]);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(null);
  const [rates, setRates] = useState({});

  useEffect(() => {
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, []);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notifications.length > 0) {
      const timer = setTimeout(() => setNotifications(n => n.slice(1)), 5000);
      return () => clearTimeout(timer);
    }
  }, [notifications]);

  function addNotification(msg, type = "info") {
    setNotifications(n => [...n, { msg, type, id: Date.now() }]);
  }

  async function connectWallet() {
    if (!window.ethereum) { addNotification("Install MetaMask!", "error"); return; }
    try {
      const p = new ethers.BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
      const s = await p.getSigner();
      const addr = await s.getAddress();

      const tokenContracts = {};
      for (const [key, cur] of Object.entries(CURRENCIES)) {
        tokenContracts[key] = new ethers.Contract(cur.addr(), ERC20_ABI, s);
      }
      const remitChain = new ethers.Contract(ADDRESSES.RemitChain, REMITCHAIN_ABI, s);

      const feedContracts = {};
      for (const [pair, info] of Object.entries(PAIRS)) {
        feedContracts[pair] = new ethers.Contract(info.feed(), PRICEFEED_ABI, s);
      }

      setAccount(addr);
      setContracts({ tokens: tokenContracts, remitChain, feeds: feedContracts });

      const owner = await remitChain.owner();
      setIsOwner(owner.toLowerCase() === addr.toLowerCase());
      setIsPaused(await remitChain.paused());

      await refreshBalances(tokenContracts, addr);
      await fetchRates(feedContracts);

      // Listen for notifications
      let lastNotifyId = 0;
      remitChain.on("NotifyRecipient", (recipient, transferId, message, amount, currency) => {
        const tid = Number(transferId);
        if (recipient.toLowerCase() === addr.toLowerCase() && tid !== lastNotifyId) {
          lastNotifyId = tid;
          addNotification(message || "You received a new transfer!", "success");
        }
      });
      remitChain.on("NotifySender", (sender, transferId, message) => {
        if (sender.toLowerCase() === addr.toLowerCase()) {
          addNotification(message || "Transfer status updated!", "info");
        }
      });

      addNotification("Wallet connected!", "success");
    } catch (err) { addNotification("Connection failed", "error"); }
  }

  async function refreshBalances(tokens, addr) {
    const bals = {};
    for (const [key, contract] of Object.entries(tokens)) {
      try { bals[key] = ethers.formatUnits(await contract.balanceOf(addr), 6); }
      catch { bals[key] = "0"; }
    }
    setBalances(bals);
  }

  async function fetchRates(feeds) {
    const r = {};
    for (const [pair, contract] of Object.entries(feeds)) {
      try {
        const [, answer] = await contract.latestRoundData();
        r[pair] = (Number(answer) / 1e8).toFixed(4);
      } catch { r[pair] = "—"; }
    }
    // Also try live rates
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const data = await res.json();
      if (data.rates) {
        if (data.rates.GBP) r["USD/GBP"] = data.rates.GBP.toFixed(4);
        if (data.rates.EUR) r["USD/EUR"] = data.rates.EUR.toFixed(4);
        if (data.rates.INR) r["USD/INR"] = data.rates.INR.toFixed(2);
        if (data.rates.JPY) r["USD/JPY"] = data.rates.JPY.toFixed(2);
      }
    } catch { }
    setRates(r);
  }

  const currentPair = `${fromCurrency}/${toCurrency}`;
  const currentRate = rates[currentPair] || "—";

  // Quote
  useEffect(() => {
    if (!contracts.remitChain || !amount || !PAIRS[currentPair]) { setQuote(null); return; }
    const timer = setTimeout(async () => {
      try {
        const [dest, fee] = await contracts.remitChain.getQuote(ethers.parseUnits(amount, 6), currentPair);
        setQuote({ receive: ethers.formatUnits(dest, 6), fee: ethers.formatUnits(fee, 6) });
      } catch { setQuote(null); }
    }, 500);
    return () => clearTimeout(timer);
  }, [amount, currentPair, contracts.remitChain]);

  async function setupContracts() {
    setIsProcessing(true); setStatus("Running setup...");
    try {
      const { remitChain } = contracts;
      for (const [key, cur] of Object.entries(CURRENCIES)) {
        let tx = await remitChain.addSupportedToken(cur.addr(), key); await tx.wait();
      }
      for (const [pair, info] of Object.entries(PAIRS)) {
        let tx = await remitChain.setPriceFeed(pair, info.feed()); await tx.wait();
      }
      setSetupDone(true); addNotification("Setup complete!", "success"); setStatus("");
    } catch (err) { setStatus("Setup failed"); addNotification("Setup failed: " + err.message, "error"); }
    setIsProcessing(false);
  }

  async function mintTokens() {
    setIsProcessing(true);
    try {
      const amt = ethers.parseUnits("10000", 6);
      let tx = await contracts.tokens["USD"].mint(account, amt); await tx.wait();
      addNotification("Minted 10,000 USDC to your wallet!", "success");
      await refreshBalances(contracts.tokens, account);
    } catch (err) { addNotification("Mint failed", "error"); }
    setIsProcessing(false);
  }

  async function sendTransfer() {
    if (!amount || !recipient || !PAIRS[currentPair]) return;
    setIsProcessing(true); setStatus("Approving...");
    try {
      const amt = ethers.parseUnits(amount, 6);
      const srcAddr = CURRENCIES[fromCurrency].addr();
      const destAddr = CURRENCIES[toCurrency].addr();
      let tx = await contracts.tokens[fromCurrency].approve(ADDRESSES.RemitChain, amt); await tx.wait();
      setStatus("Sending...");
      tx = await contracts.remitChain.initiateTransfer(recipient, srcAddr, destAddr, amt, currentPair);
      await tx.wait();
      addNotification("Transfer sent!", "success"); setStatus("");
      setAmount(""); setRecipient(""); setQuote(null);
      await refreshBalances(contracts.tokens, account);
      await loadHistory();
    } catch (err) { addNotification("Transfer failed", "error"); setStatus(""); }
    setIsProcessing(false);
  }

  const loadHistory = useCallback(async () => {
    if (!contracts.remitChain) return;
    try {
      const count = await contracts.remitChain.transferCount();
      const txs = [];
      for (let i = Number(count); i >= 1; i--) {
        const t = await contracts.remitChain.getTransferDetails(i);
        txs.push({
          id: Number(t.id), sender: t.sender, recipient: t.recipient,
          senderLow: t.sender.toLowerCase(), recipientLow: t.recipient.toLowerCase(),
          sourceAmount: ethers.formatUnits(t.sourceAmount, 6),
          destAmount: ethers.formatUnits(t.destinationAmount, 6),
          fee: ethers.formatUnits(t.fee, 6),
          status: STATUS_MAP[Number(t.status)],
          currencyPair: t.currencyPair,
          claimedAt: Number(t.claimedAt),
          date: new Date(Number(t.createdAt) * 1000).toLocaleString(),
        });
      }
      setTxHistory(txs);
    } catch (e) { console.error(e); }
  }, [contracts.remitChain]);

  async function handleAction(action, id) {
    setIsProcessing(true);
    try {
      let tx;
      if (action === "claim") tx = await contracts.remitChain.claimTransfer(id);
      else if (action === "reverse") tx = await contracts.remitChain.reverseTransfer(id);
      else if (action === "withdraw") tx = await contracts.remitChain.withdrawTransfer(id);
      else if (action === "refund") tx = await contracts.remitChain.refundTransfer(id);
      await tx.wait();
      addNotification(`Transfer #${id} — ${action} successful!`, "success");
      await refreshBalances(contracts.tokens, account);
      await loadHistory();
    } catch (err) { addNotification(`${action} failed: ${err.message}`, "error"); }
    setIsProcessing(false);
  }

  async function togglePause() {
    setIsProcessing(true);
    try {
      let tx;
      if (isPaused) { tx = await contracts.remitChain.unpauseContract(); }
      else { tx = await contracts.remitChain.pauseContract("Admin emergency freeze"); }
      await tx.wait();
      setIsPaused(!isPaused);
      addNotification(isPaused ? "Contract resumed" : "Contract FROZEN", isPaused ? "success" : "error");
    } catch (err) { addNotification("Failed: " + err.message, "error"); }
    setIsProcessing(false);
  }

  function formatCountdown(claimedAt) {
    const remaining = (claimedAt + 60) - now;
    if (remaining <= 0) return null;
    return `${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, "0")}`;
  }

  const acctLow = account.toLowerCase();
  const toCurrencies = Object.keys(CURRENCIES).filter(c => PAIRS[`${fromCurrency}/${c}`]);


  // RENDER

  return (
    <div style={{ minHeight: "100vh", background: "#0b0e11", fontFamily: "'Outfit', 'Sora', sans-serif", color: "#eaecef" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #474d57; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2b3139; border-radius: 4px; }
        @keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>

      {/* Notifications Toast */}
      <div style={{ position: "fixed", top: "80px", right: "20px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px" }}>
        {notifications.map(n => (
          <div key={n.id} style={{
            padding: "12px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 500,
            background: n.type === "error" ? "rgba(246,70,93,0.15)" : n.type === "success" ? "rgba(14,203,129,0.15)" : "rgba(240,185,11,0.15)",
            border: `1px solid ${n.type === "error" ? "#f6465d33" : n.type === "success" ? "#0ecb8133" : "#f0b90b33"}`,
            color: n.type === "error" ? "#f6465d" : n.type === "success" ? "#0ecb81" : "#f0b90b",
            animation: "slideIn 0.3s ease", minWidth: "280px", maxWidth: "380px",
            backdropFilter: "blur(12px)",
          }}>{n.msg}</div>
        ))}
      </div>

      {/* Header */}
      <header style={{
        padding: "0 24px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #1e2329", background: "rgba(11,14,17,0.95)", backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 1000,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "linear-gradient(135deg, #f0b90b, #f8d12f)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "16px", fontWeight: 900, color: "#0b0e11",
            }}>R</div>
            <span style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.3px" }}>
              Remit<span style={{ color: "#f0b90b" }}>Chain</span>
            </span>
          </div>

          {/* Rate ticker */}
          {account && (
            <div style={{ display: "flex", gap: "16px", fontSize: "12px" }}>
              {Object.entries(rates).map(([pair, rate]) => (
                <div key={pair} style={{ display: "flex", alignItems: "center", gap: "6px", color: "#848e9c" }}>
                  <span>{pair}</span>
                  <span style={{ color: "#eaecef", fontWeight: 600, fontFamily: "'JetBrains Mono'" }}>{rate}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0ecb81", animation: "pulse 2s infinite" }} />
                <span style={{ color: "#0ecb81", fontSize: "10px", fontWeight: 600 }}>LIVE</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {isPaused && (
            <div style={{ padding: "4px 10px", borderRadius: "4px", background: "rgba(246,70,93,0.15)", color: "#f6465d", fontSize: "11px", fontWeight: 700 }}>
              ⚠ FROZEN
            </div>
          )}
          <span style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "4px", background: "rgba(14,203,129,0.1)", color: "#0ecb81", fontWeight: 600 }}>Sepolia</span>
          {account ? (
            <div style={{
              padding: "8px 16px", borderRadius: "8px", background: "#1e2329",
              border: "1px solid #2b3139", fontSize: "13px", fontWeight: 500,
              fontFamily: "'JetBrains Mono'", color: "#eaecef",
            }}>
              {account.slice(0, 6)}...{account.slice(-4)}
            </div>
          ) : (
            <button onClick={connectWallet} style={{
              padding: "10px 24px", borderRadius: "8px", border: "none",
              background: "#f0b90b", color: "#0b0e11", fontSize: "14px",
              fontWeight: 700, cursor: "pointer",
            }}>Connect Wallet</button>
          )}
        </div>
      </header>

      {/* Main Content */}
      {!account ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)", padding: "40px" }}>
          <div style={{ animation: "fadeUp 0.6s ease" }}>
            <div style={{ fontSize: "56px", marginBottom: "20px", textAlign: "center" }}>🌐</div>
            <h1 style={{ fontSize: "42px", fontWeight: 900, textAlign: "center", letterSpacing: "-1px", lineHeight: 1.1 }}>
              Send Money<br /><span style={{ color: "#f0b90b" }}>Across Borders</span>
            </h1>
            <p style={{ color: "#848e9c", fontSize: "16px", textAlign: "center", marginTop: "16px", maxWidth: "440px", lineHeight: 1.6 }}>
              Instant cross-border transfers powered by blockchain. Multi-currency. 0.3% fees. Sender protection built in.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "32px" }}>
              <button onClick={connectWallet} style={{
                padding: "14px 40px", borderRadius: "8px", border: "none",
                background: "#f0b90b", color: "#0b0e11", fontSize: "16px",
                fontWeight: 700, cursor: "pointer",
              }}>Connect Wallet</button>
            </div>
            <div style={{ display: "flex", gap: "32px", justifyContent: "center", marginTop: "48px" }}>
              {[
                { v: "5", l: "Currencies" },
                { v: "0.3%", l: "Fee" },
                { v: "~5min", l: "Settlement" },
                { v: "100%", l: "On-chain" },
              ].map(s => (
                <div key={s.l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#f0b90b" }}>{s.v}</div>
                  <div style={{ fontSize: "11px", color: "#848e9c", marginTop: "4px" }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 20px", display: "grid", gridTemplateColumns: "340px 1fr", gap: "20px" }}>

          {/* LEFT SIDEBAR */}
          <div>
            {/* Admin Panel */}
            {isOwner && (
              <div style={{ background: "#1e2329", borderRadius: "12px", padding: "16px", marginBottom: "12px", border: "1px solid #2b3139" }}>
                <div style={{ fontSize: "12px", color: "#848e9c", fontWeight: 600, marginBottom: "10px" }}>ADMIN</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {!setupDone && (
                    <button onClick={setupContracts} disabled={isProcessing} style={{
                      flex: 1, padding: "8px", borderRadius: "6px", border: "none",
                      background: "#f0b90b", color: "#0b0e11", fontSize: "12px",
                      fontWeight: 700, cursor: "pointer",
                    }}>{isProcessing ? "..." : "Setup"}</button>
                  )}
                  <button onClick={togglePause} disabled={isProcessing} style={{
                    flex: 1, padding: "8px", borderRadius: "6px", border: "none",
                    background: isPaused ? "rgba(14,203,129,0.15)" : "rgba(246,70,93,0.15)",
                    color: isPaused ? "#0ecb81" : "#f6465d",
                    fontSize: "12px", fontWeight: 700, cursor: "pointer",
                  }}>{isPaused ? "▶ Resume" : "⏸ Freeze"}</button>
                </div>
              </div>
            )}

            {/* Balances */}
            <div style={{ background: "#1e2329", borderRadius: "12px", padding: "16px", border: "1px solid #2b3139", marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700 }}>Balances</span>
                <button onClick={mintTokens} disabled={isProcessing} style={{
                  padding: "5px 12px", borderRadius: "4px", border: "1px solid #2b3139",
                  background: "transparent", color: "#f0b90b", fontSize: "11px",
                  fontWeight: 600, cursor: "pointer",
                }}>+ Get Test USDC</button>
              </div>
              {Object.entries(CURRENCIES).map(([key, cur]) => (
                <div key={key} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", borderBottom: "1px solid #1a1d23",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "18px" }}>{cur.flag}</span>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>{cur.token}</div>
                      <div style={{ fontSize: "10px", color: "#848e9c" }}>{cur.name}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono'", fontSize: "13px", fontWeight: 600 }}>
                    {parseFloat(balances[key] || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div style={{ background: "#1e2329", borderRadius: "12px", padding: "16px", border: "1px solid #2b3139" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "14px" }}>How It Works</div>
              {[
                { n: "1", t: "Send", d: "Deposit stablecoin", c: "#f0b90b" },
                { n: "2", t: "Claim", d: "Recipient claims, 5min grace starts", c: "#00b4d8" },
                { n: "3", t: "Grace", d: "Sender can reverse if wrong address", c: "#f6465d" },
                { n: "4", t: "Withdraw", d: "After grace, funds are final", c: "#0ecb81" },
              ].map(s => (
                <div key={s.n} style={{ display: "flex", gap: "10px", marginBottom: "12px", alignItems: "flex-start" }}>
                  <div style={{
                    minWidth: "24px", height: "24px", borderRadius: "6px", background: s.c + "20",
                    color: s.c, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "11px", fontWeight: 800,
                  }}>{s.n}</div>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600 }}>{s.t}</div>
                    <div style={{ fontSize: "11px", color: "#848e9c" }}>{s.d}</div>
                  </div>
                </div>
              ))}
              <div style={{
                marginTop: "12px", padding: "10px", borderRadius: "8px",
                background: "rgba(240,185,11,0.06)", border: "1px solid rgba(240,185,11,0.1)",
                fontSize: "11px", color: "#f0b90b", lineHeight: 1.5,
              }}>
                Sender Protection - Reverse within 5 minutes if sent to wrong address.
              </div>
            </div>
          </div>

          {/* RIGHT MAIN AREA */}
          <div>
            {/* Tabs */}
            <div style={{
              display: "flex", gap: "0", marginBottom: "16px",
              borderBottom: "1px solid #1e2329",
            }}>
              {["send", "history"].map(tab => (
                <button key={tab} onClick={() => { setActiveTab(tab); if (tab === "history") loadHistory(); }}
                  style={{
                    padding: "12px 24px", border: "none", background: "transparent",
                    color: activeTab === tab ? "#eaecef" : "#848e9c",
                    fontSize: "14px", fontWeight: 600, cursor: "pointer",
                    borderBottom: activeTab === tab ? "2px solid #f0b90b" : "2px solid transparent",
                    transition: "all 0.2s",
                  }}>
                  {tab === "send" ? "Send Money" : "Transfer History"}
                </button>
              ))}
            </div>

            {/* SEND TAB */}
            {activeTab === "send" && (
              <div style={{ maxWidth: "520px", animation: "fadeUp 0.3s ease" }}>
                {/* From */}
                <div style={{
                  background: "#1e2329", borderRadius: "12px", padding: "20px",
                  border: "1px solid #2b3139",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#848e9c" }}>You Send</span>
                    <span style={{ fontSize: "12px", color: "#848e9c" }}>
                      Balance: <span style={{ color: "#eaecef" }}>{parseFloat(balances[fromCurrency] || 0).toFixed(2)}</span>
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "8px 14px", borderRadius: "8px", background: "#0b0e11",
                      cursor: "pointer", fontSize: "15px", fontWeight: 600,
                    }}>
                      <span style={{ fontSize: "20px" }}>{CURRENCIES[fromCurrency].flag}</span>
                      {CURRENCIES[fromCurrency].token}
                    </div>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="0.00" style={{
                        flex: 1, background: "none", border: "none", outline: "none",
                        color: "#eaecef", fontSize: "28px", fontWeight: 700, textAlign: "right",
                        fontFamily: "'JetBrains Mono'",
                      }} />
                  </div>
                </div>

                {/* Swap arrow */}
                <div style={{ display: "flex", justifyContent: "center", margin: "-6px 0", position: "relative", zIndex: 2 }}>
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "10px",
                    background: "#1e2329", border: "3px solid #0b0e11",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "14px", color: "#f0b90b",
                  }}>↓</div>
                </div>

                {/* To */}
                <div style={{
                  background: "#1e2329", borderRadius: "12px", padding: "20px",
                  border: "1px solid #2b3139",
                }}>
                  <div style={{ fontSize: "12px", color: "#848e9c", marginBottom: "8px" }}>They Receive</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div onClick={() => setShowCurrencyDropdown(showCurrencyDropdown ? null : "to")}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "8px 14px", borderRadius: "8px", background: "#0b0e11",
                        cursor: "pointer", fontSize: "15px", fontWeight: 600, position: "relative",
                      }}>
                      <span style={{ fontSize: "20px" }}>{CURRENCIES[toCurrency].flag}</span>
                      {CURRENCIES[toCurrency].token}
                      <span style={{ fontSize: "10px", color: "#848e9c" }}>▼</span>

                      {showCurrencyDropdown === "to" && (
                        <div style={{
                          position: "absolute", top: "100%", left: 0, marginTop: "4px",
                          background: "#1e2329", border: "1px solid #2b3139", borderRadius: "8px",
                          overflow: "hidden", minWidth: "180px", zIndex: 100,
                        }}>
                          {toCurrencies.map(c => (
                            <div key={c} onClick={() => { setToCurrency(c); setShowCurrencyDropdown(null); }}
                              style={{
                                padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px",
                                cursor: "pointer", fontSize: "13px",
                                background: c === toCurrency ? "rgba(240,185,11,0.08)" : "transparent",
                              }}
                              onMouseEnter={e => e.target.style.background = "rgba(240,185,11,0.08)"}
                              onMouseLeave={e => e.target.style.background = c === toCurrency ? "rgba(240,185,11,0.08)" : "transparent"}>
                              <span>{CURRENCIES[c].flag}</span>
                              <span style={{ fontWeight: 600 }}>{c}</span>
                              <span style={{ color: "#848e9c", fontSize: "11px" }}>{CURRENCIES[c].name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{
                      flex: 1, textAlign: "right", fontSize: "28px", fontWeight: 700,
                      fontFamily: "'JetBrains Mono'",
                      color: quote ? "#0ecb81" : "#474d57",
                    }}>
                      {quote ? parseFloat(quote.receive).toFixed(2) : "0.00"}
                    </div>
                  </div>
                </div>

                {/* Quote breakdown */}
                {quote && (
                  <div style={{
                    marginTop: "12px", padding: "14px 16px", borderRadius: "10px",
                    background: "#1e2329", border: "1px solid #2b3139", fontSize: "13px",
                  }}>
                    {[
                      { l: "Exchange Rate", v: `1 ${fromCurrency} = ${quote.receive && amount ? (parseFloat(quote.receive) / (parseFloat(amount) - parseFloat(quote.fee))).toFixed(4) : currentRate} ${toCurrency}` },
                      { l: "Fee (0.3%)", v: `${parseFloat(quote.fee).toFixed(2)} ${CURRENCIES[fromCurrency].token}` },
                      { l: "You Save vs Banks", v: `${(parseFloat(amount) * 0.059).toFixed(2)} ${CURRENCIES[fromCurrency].token}`, c: "#0ecb81" },
                    ].map(r => (
                      <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                        <span style={{ color: "#848e9c" }}>{r.l}</span>
                        <span style={{ color: r.c || "#eaecef", fontWeight: 500 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recipient */}
                <div style={{ marginTop: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#848e9c", marginBottom: "6px" }}>Recipient Address</div>
                  <input type="text" value={recipient} onChange={e => setRecipient(e.target.value)}
                    placeholder="0x..." style={{
                      width: "100%", padding: "14px 16px", background: "#1e2329",
                      border: "1px solid #2b3139", borderRadius: "10px", color: "#eaecef",
                      fontSize: "14px", fontFamily: "'JetBrains Mono'", outline: "none",
                    }} />
                </div>

                {/* Send Button */}
                {(() => {
                  const insufficient = amount && parseFloat(amount) > parseFloat(balances[fromCurrency] || 0);
                  const disabled = isProcessing || !amount || !recipient || isPaused || insufficient;
                  return (
                    <button onClick={sendTransfer} disabled={disabled}
                      style={{
                        width: "100%", padding: "16px", marginTop: "16px", borderRadius: "10px",
                        border: "none", fontSize: "16px", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
                        background: insufficient ? "#f6465d20" : disabled ? "#2b3139" : "#f0b90b",
                        color: insufficient ? "#f6465d" : disabled ? "#474d57" : "#0b0e11",
                        transition: "all 0.2s",
                      }}>
                      {isPaused ? "⚠ Contract Frozen" : isProcessing ? "Processing..." : insufficient ? `Insufficient ${CURRENCIES[fromCurrency].token} Balance` : status || `Send ${CURRENCIES[fromCurrency].token} → ${CURRENCIES[toCurrency].token}`}
                    </button>
                  );
                })()}
              </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === "history" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                {txHistory.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 20px", color: "#474d57" }}>

                    <div style={{ fontSize: "20px" }}>No transfers yet</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {/* Table Header */}
                    <div style={{
                      display: "grid", gridTemplateColumns: "60px 1fr 1fr 100px 1fr",
                      padding: "8px 16px", fontSize: "11px", color: "#848e9c", fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.5px",
                    }}>
                      <span>#</span><span>Pair</span><span>Amount</span><span>Status</span><span>Action</span>
                    </div>

                    {txHistory.map(tx => {
                      const isSender = tx.senderLow === acctLow;
                      const isRecipient = tx.recipientLow === acctLow;
                      const countdown = tx.status === "Claimed" ? formatCountdown(tx.claimedAt) : null;
                      const graceExpired = tx.status === "Claimed" && !countdown;
                      const pair = tx.currencyPair.split("/");
                      const statusColor = {
                        Pending: "#f0b90b", Claimed: "#00b4d8", Completed: "#0ecb81",
                        Reversed: "#f6465d", Refunded: "#f6465d",
                      }[tx.status] || "#848e9c";

                      return (
                        <div key={tx.id} style={{
                          background: "#1e2329", borderRadius: "10px", padding: "16px",
                          border: tx.status === "Claimed" ? "1px solid rgba(0,180,216,0.2)" : "1px solid #2b3139",
                        }}>
                          <div style={{
                            display: "grid", gridTemplateColumns: "60px 1fr 1fr 100px 1fr",
                            alignItems: "center", fontSize: "13px",
                          }}>
                            <span style={{ fontWeight: 700 }}>#{tx.id}</span>
                            <div>
                              <span>{CURRENCIES[pair[0]]?.flag} {pair[0]} → {CURRENCIES[pair[1]]?.flag} {pair[1]}</span>
                              <div style={{ fontSize: "11px", color: "#848e9c" }}>
                                {isSender ? "Sent" : "Received"} · {tx.date} · <a href={`https://sepolia.etherscan.io/address/${ADDRESSES.RemitChain}`} target="_blank" rel="noopener noreferrer" style={{ color: "#f0b90b", textDecoration: "none" }}>View on Etherscan ↗</a>
                              </div>
                            </div>
                            <div>
                              <div>{tx.sourceAmount} <span style={{ color: "#848e9c" }}>{CURRENCIES[pair[0]]?.token}</span></div>
                              <div style={{ color: "#0ecb81", fontWeight: 600 }}>→ {parseFloat(tx.destAmount).toFixed(2)} <span style={{ fontWeight: 400 }}>{CURRENCIES[pair[1]]?.token}</span></div>
                            </div>
                            <div>
                              <span style={{
                                fontSize: "11px", fontWeight: 700, color: statusColor,
                                padding: "3px 8px", borderRadius: "4px",
                                background: statusColor + "15",
                              }}>{tx.status}</span>
                              {countdown && (
                                <div style={{ fontSize: "11px", color: "#00b4d8", marginTop: "4px", fontFamily: "'JetBrains Mono'" }}>
                                  ⏱ {countdown}
                                </div>
                              )}
                            </div>
                            <div>
                              {tx.status === "Pending" && isRecipient && (
                                <button onClick={() => handleAction("claim", tx.id)} disabled={isProcessing}
                                  style={{ padding: "6px 16px", borderRadius: "6px", border: "none", background: "#f0b90b", color: "#0b0e11", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                                  Claim
                                </button>
                              )}
                              {tx.status === "Pending" && isSender && (
                                <button onClick={() => handleAction("refund", tx.id)} disabled={isProcessing}
                                  style={{ padding: "6px 16px", borderRadius: "6px", border: "1px solid #2b3139", background: "transparent", color: "#f6465d", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                                  Cancel
                                </button>
                              )}
                              {tx.status === "Claimed" && isSender && countdown && (
                                <button onClick={() => handleAction("reverse", tx.id)} disabled={isProcessing}
                                  style={{ padding: "6px 16px", borderRadius: "6px", border: "none", background: "rgba(246,70,93,0.15)", color: "#f6465d", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                                  ⚠ Reverse
                                </button>
                              )}
                              {tx.status === "Claimed" && isRecipient && graceExpired && (
                                <button onClick={() => handleAction("withdraw", tx.id)} disabled={isProcessing}
                                  style={{ padding: "6px 16px", borderRadius: "6px", border: "none", background: "#0ecb81", color: "#0b0e11", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                                  Withdraw
                                </button>
                              )}
                              {tx.status === "Claimed" && isRecipient && countdown && (
                                <span style={{ fontSize: "11px", color: "#848e9c" }}>Waiting...</span>
                              )}
                              {tx.status === "Completed" && (
                                <span style={{ fontSize: "11px", color: "#0ecb81" }}>✓ Done</span>
                              )}
                              {tx.status === "Reversed" && (
                                <span style={{ fontSize: "11px", color: isSender ? "#0ecb81" : "#f6465d" }}>
                                  {isSender
                                    ? `✓ Reversed - Refunded ${(parseFloat(tx.sourceAmount) - parseFloat(tx.fee)).toFixed(2)} ${CURRENCIES[tx.currencyPair.split("/")[0]]?.token}`
                                    : `⚠ Reversed by sender`}
                                </span>
                              )}
                              {tx.status === "Refunded" && (
                                <span style={{ fontSize: "11px", color: isSender ? "#0ecb81" : "#f6465d" }}>
                                  {isSender
                                    ? `✓ Cancelled - Refunded ${(parseFloat(tx.sourceAmount) - parseFloat(tx.fee)).toFixed(2)} ${CURRENCIES[tx.currencyPair.split("/")[0]]?.token}`
                                    : `⚠ Cancelled by sender`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}