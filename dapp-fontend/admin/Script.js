/* script.js (updated)
   - loads charityAbi.json via fetch (so CONTRACT_ABI can be provided externally)
   - safety checks, Promise.all optimizations, better error handling
   - compatible with ethers v6 UMD build (global `ethers`)
*/

let CONTRACT_ADDRESS = "0xD09bf13AaFba0Cb3e0a0d5556eF75C4Bd69fe340"; // your deployed address
let CONTRACT_ABI = null; // Sẽ được load trong loadAbi() function

let provider = null;
let signer = null;
let currentAccount = null;
let contract = null;

let eventsAttached = false;

// ---------- helpers ----------
async function switchToConfluxNetwork() {
  if (!window.ethereum) {
    showAlert("MetaMask không được tìm thấy!", "danger");
    return false;
  }
  
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x47' }], // 71 in hex
    });
    return true;
  } catch (switchError) {
    // Network chưa được thêm, hãy thêm nó
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x47',
            chainName: 'Conflux eSpace Testnet',
            nativeCurrency: {
              name: 'CFX',
              symbol: 'CFX',
              decimals: 18,
            },
            rpcUrls: ['https://evmtestnet.confluxrpc.com'],
            blockExplorerUrls: ['https://evmtestnet.confluxscan.io'],
          }],
        });
        return true;
      } catch (addError) {
        console.error("Failed to add network:", addError);
        showAlert("Không thể thêm Conflux network. Vui lòng thêm thủ công.", "danger");
        return false;
      }
    } else {
      console.error("Failed to switch network:", switchError);
      showAlert("Không thể chuyển network: " + switchError.message, "danger");
      return false;
    }
  }
}

function showAlert(message, type = "success", timeout = 4500) {
  const wrap = document.getElementById("alertPlaceholder");
  if (!wrap) return;
  const id = "alert-" + Date.now();
  wrap.insertAdjacentHTML("afterbegin", `
    <div id="${id}" class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `);
  if (timeout) setTimeout(() => { const el = document.getElementById(id); if (el) el.remove(); }, timeout);
}

function shaCut(addr) {
  if (!addr) return "";
  return `${addr.slice(0,6)}...${addr.slice(-4)}`;
}

function formatEther(wei) {
  try { return ethers.formatEther(wei); } catch(e) { return String(wei); }
}
function parseEtherEth(x) { return ethers.parseEther(x.toString()); }

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
                   .replaceAll('"',"&quot;").replaceAll("'", "&#039;");
}

// Safe ABI loader — dùng khi bạn fetch('./charityAbi.json')
async function loadAbi() {
  try {
    const resp = await fetch('./charityAbi.json');
    if (!resp.ok) throw new Error('Không tìm thấy charityAbi.json (404)');
    const json = await resp.json();

    // Nếu file là mảng ABI trực tiếp
    if (Array.isArray(json)) {
      CONTRACT_ABI = json;
      console.log("Loaded ABI (array) — length:", CONTRACT_ABI.length);
      return CONTRACT_ABI;
    }

    // Nếu file chứa object { "abi": [...] }
    if (Array.isArray(json.abi)) {
      CONTRACT_ABI = json.abi;
      console.log("Loaded ABI from json.abi — length:", CONTRACT_ABI.length);
      return CONTRACT_ABI;
    }

    // Nếu không tìm thấy, log để debug
    console.error("Không tìm thấy mảng ABI trong charityAbi.json — in ra nội dung để debug:", json);
    showAlert("Lỗi: charityAbi.json không chứa ABI ở định dạng mong đợi. Kiểm tra console.", "danger", 8000);
    throw new Error("No ABI array found in charityAbi.json");
  } catch (e) {
    console.error("loadAbi failed:", e);
    throw e;
  }
}


// ---------- connect / disconnect ----------
async function connectMetaMask() {
  if (!window.ethereum) { showAlert("Vui lòng cài MetaMask.", "warning"); return; }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    currentAccount = accounts[0];

    if (!CONTRACT_ABI) await loadAbi();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Kiểm tra network
    const network = await provider.getNetwork();
    console.log("Connected to network:", network.name, network.chainId);
    
    const switchNetworkBtn = document.getElementById("switchNetworkBtn");
    if (network.chainId !== 71n) {
      showAlert(`⚠️ Sai network! Hiện tại: ${network.chainId}. Cần: Conflux eSpace Testnet (71)`, "warning", 10000);
      if (switchNetworkBtn) switchNetworkBtn.style.display = "inline-block";
      // Vẫn tiếp tục để user có thể switch network
    } else {
      if (switchNetworkBtn) switchNetworkBtn.style.display = "none";
    }

    // Kiểm tra contract có tồn tại không
    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (!code || code === "0x") {
      showAlert("❌ Contract không tồn tại tại địa chỉ này!", "danger");
      return;
    }

    // Kiểm tra quyền admin với error handling
    let isAdmin = false;
    let owner = "Unknown";
    
    try {
      // Test basic contract call first
      const nextId = await contract.nextCampaignId();
      console.log("Contract working, nextCampaignId:", nextId.toString());
      
      // Now try admin functions
      owner = await contract.owner();
      isAdmin = await contract.isAdmin(currentAccount);
    } catch (err) {
      console.error("Error checking admin status:", err);
      showAlert("⚠️ Không thể kiểm tra quyền admin. Contract có thể chưa ready.", "warning");
      // Continue anyway
    }
    
    const adminWalletEl = document.getElementById("adminWallet");
    if (adminWalletEl) {
      if (isAdmin) {
        adminWalletEl.innerHTML = `<i class="fas fa-wallet"></i> <span class="badge bg-success">ADMIN</span> ${shaCut(currentAccount)}`;
      } else {
        adminWalletEl.innerHTML = `<i class="fas fa-wallet"></i> <span class="badge bg-warning">USER</span> ${shaCut(currentAccount)}`;
      }
    }
    
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.style.display = "inline-block";

    showAlert(isAdmin ? 
      "Kết nối MetaMask thành công - Bạn là Admin ✅" : 
      `Kết nối MetaMask thành công - Bạn không có quyền admin. Owner: ${shaCut(owner)}`, 
      isAdmin ? "success" : "info");
      
    await refreshDashboard();
    attachContractEventListeners();
  } catch (err) {
    console.error("Connect error:", err);
    showAlert("Lỗi khi kết nối MetaMask: " + (err?.reason || err?.message || err), "danger");
  }
}

async function connectLocalRPC(url = "http://127.0.0.1:8545") {
  try {
    provider = new ethers.JsonRpcProvider(url);
    const accounts = await provider.listAccounts();
    if (!accounts || accounts.length === 0) { showAlert("Không có tài khoản trên local RPC.", "warning"); return; }
    signer = provider.getSigner(accounts[0]);
    currentAccount = accounts[0];

    if (!CONTRACT_ABI) await loadAbi();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Kiểm tra quyền admin
    const isAdmin = await contract.isAdmin(currentAccount);
    const owner = await contract.owner();
    
    const adminWalletEl = document.getElementById("adminWallet");
    if (adminWalletEl) {
      if (isAdmin) {
        adminWalletEl.innerHTML = `<i class="fas fa-plug"></i> <span class="badge bg-success">ADMIN</span> Local ${shaCut(currentAccount)}`;
      } else {
        adminWalletEl.innerHTML = `<i class="fas fa-plug"></i> <span class="badge bg-warning">USER</span> Local ${shaCut(currentAccount)}`;
      }
    }
    
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.style.display = "inline-block";

    showAlert(isAdmin ? 
      "Kết nối Hardhat RPC thành công - Bạn là Admin ⚡" : 
      `Kết nối Hardhat RPC thành công - Bạn không có quyền admin. Owner: ${shaCut(owner)}`, 
      isAdmin ? "success" : "warning");
      
    await refreshDashboard();
    attachContractEventListeners();
  } catch (err) {
    console.error(err);
    showAlert("Lỗi khi kết nối local RPC: " + (err?.message || err), "danger");
  }
}

function detachEventListeners() {
  if (!contract || !eventsAttached) return;
  try {
    contract.removeAllListeners();
  } catch (e) { console.warn("removeAllListeners failed", e); }
  eventsAttached = false;
}

function disconnectWallet() {
  detachEventListeners();
  provider = null; signer = null; currentAccount = null; contract = null;
  const adminWalletEl = document.getElementById("adminWallet");
  if (adminWalletEl) adminWalletEl.innerHTML = `<i class="fas fa-wallet"></i> Kết nối ví`;
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = "none";
  showAlert("Đã ngắt kết nối ví 🔌", "info");
}

// ---------- safe contract require ----------
function requireContractSafely() {
  if (!contract) {
    showAlert("Contract chưa khởi tạo. Vui lòng kết nối ví.", "warning");
    throw new Error("No contract");
  }
  return contract;
}

async function isAdminAddress(addr = null) {
  if (!contract) return false;
  try {
    const who = addr || currentAccount;
    if (!who) return false;
    
    // First check if contract is responsive
    const nextId = await contract.nextCampaignId();
    if (!nextId) {
      console.warn("Contract not responsive");
      return false;
    }
    
    const result = await contract.isAdmin(who);
    return result;
  } catch (e) {
    console.warn("isAdmin check failed", e);
    return false;
  }
}

// ---------- read functions ----------
async function getNextCampaignId() {
  const c = requireContractSafely();
  const id = await c.nextCampaignId();
  return Number(id.toString());
}

async function getCampaign(id) {
  const c = requireContractSafely();
  const raw = await c.campaigns(id);
  return {
    id: Number(raw.id.toString()),
    creator: raw.creator,
    title: raw.title,
    description: raw.description,
    media: raw.media,
    location: raw.location,
    targetAmount: formatEther(raw.targetAmount ?? 0),
    campaignWallet: raw.campaignWallet,
    collected: formatEther(raw.collected ?? 0),
    createdAt: Number(raw.createdAt?.toString() || 0),
    active: raw.active
  };
}

async function loadAllCampaigns() {
  const c = requireContractSafely();
  const nextId = await getNextCampaignId();
  if (nextId <= 1) return [];
  // parallel fetch
  const ids = [];
  for (let i = 1; i < nextId; i++) ids.push(i);
  const promises = ids.map(i => getCampaign(i).catch(e => { console.warn("skip", i, e); return null; }));
  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

// donations/disbursements/comments read functions (kept as-is)
async function getDonationsCount(campaignId) {
  const c = requireContractSafely();
  const n = await c.getDonationsCount(campaignId);
  return Number(n.toString());
}
async function getDonation(campaignId, index) {
  const c = requireContractSafely();
  return await c.getDonation(campaignId, index);
}
async function getDisbursementsCount(campaignId) {
  const c = requireContractSafely();
  const n = await c.getDisbursementsCount(campaignId);
  return Number(n.toString());
}
async function getDisbursement(campaignId, index) {
  const c = requireContractSafely();
  return await c.getDisbursement(campaignId, index);
}
async function getCommentsCount(campaignId) {
  const c = requireContractSafely();
  const n = await c.getCommentsCount(campaignId);
  return Number(n.toString());
}
async function getComment(campaignId, index) {
  const c = requireContractSafely();
  return await c.getComment(campaignId, index);
}

// ---------- write functions ----------
async function setAdminFrontend(address, isAdmin) {
  try {
    const c = requireContractSafely();
    const owner = await c.owner();
    if (currentAccount.toLowerCase() !== owner.toLowerCase()) {
      showAlert("Chỉ owner mới có thể thiết lập admin.", "warning");
      return;
    }
    
    const tx = await c.setAdmin(address, isAdmin);
    showAlert("Đang gửi yêu cầu thiết lập admin...", "info", 8000);
    const receipt = await tx.wait();
    showAlert(`${isAdmin ? "Cấp" : "Thu hồi"} quyền admin thành công — tx: <code>${receipt.transactionHash}</code>`, "success", 8000);
    await refreshDashboard();
    return receipt;
  } catch (err) {
    console.error(err);
    showAlert("Thiết lập admin thất bại: " + (err?.reason || err?.message || err), "danger");
    throw err;
  }
}

async function createCampaignFrontend(formData) {
  try {
    const c = requireContractSafely();
    const admin = await isAdminAddress();
    if (!admin) { showAlert("Chức năng này chỉ dành cho admin.", "warning"); return; }

    const tx = await c.createCampaign(
      formData.title,
      formData.description,
      formData.media || "",
      formData.location || "",
      parseEtherEth(formData.targetAmount || "0"),
      formData.campaignWallet || ethers.ZeroAddress
    );
    showAlert("Gửi yêu cầu tạo campaign. Đang chờ xác nhận giao dịch...", "info", 10000);
    const receipt = await tx.wait();
    showAlert(`Tạo chiến dịch thành công — tx: <code>${receipt.transactionHash}</code>`, "success", 8000);
    await refreshDashboard();
    return receipt;
  } catch (err) {
    console.error(err);
    showAlert("Tạo chiến dịch thất bại: " + (err?.reason || err?.message || err), "danger");
    throw err;
  }
}

async function donateToCampaign(campaignId, amountEth) {
  try {
    requireContractSafely();
    if (!signer) { showAlert("Bạn chưa kết nối ví!", "warning"); return; }
    const value = parseEtherEth(amountEth.toString());
    const tx = await contract.donate(campaignId, { value });
    showAlert("Gửi donate... chờ mạng xác nhận", "info", 8000);
    const receipt = await tx.wait();
    showAlert(`Donate thành công — tx: <code>${receipt.transactionHash}</code>`, "success", 8000);
    await refreshDashboard();
    return receipt;
  } catch (err) {
    console.error(err);
    showAlert("Donate thất bại: " + (err?.reason || err?.message || err), "danger");
    throw err;
  }
}

async function disburseFromContractFrontend(campaignId, recipient, amountEth) {
  try {
    const c = requireContractSafely();
    const admin = await isAdminAddress();
    if (!admin) { showAlert("Chỉ admin mới có thể giải ngân từ contract.", "warning"); return; }
    const amount = parseEtherEth(amountEth.toString());
    const tx = await c.disburseFromContract(campaignId, recipient, amount);
    showAlert("Gửi yêu cầu giải ngân...", "info", 8000);
    const receipt = await tx.wait();
    showAlert(`Giải ngân thành công — tx: <code>${receipt.transactionHash}</code>`, "success", 8000);
    await refreshDashboard();
    return receipt;
  } catch (err) {
    console.error(err);
    showAlert("Giải ngân thất bại: " + (err?.reason || err?.message || err), "danger");
    throw err;
  }
}

async function setCampaignActiveFrontend(campaignId, active) {
  try {
    const c = requireContractSafely();
    const admin = await isAdminAddress();
    if (!admin) { showAlert("Chỉ admin mới có quyền này.", "warning"); return; }
    const tx = await c.setCampaignActive(campaignId, active);
    await tx.wait();
    showAlert(`Đã ${active ? "kích hoạt" : "vô hiệu hóa"} chiến dịch #${campaignId}`, "success");
    await refreshDashboard();
  } catch (err) {
    console.error(err);
    showAlert("Thao tác thất bại: " + (err?.reason || err?.message || err), "danger");
  }
}

async function addCommentFrontend(campaignId, text, anon = false) {
  try {
    const c = requireContractSafely();
    const tx = await c.addComment(campaignId, text, anon);
    await tx.wait();
    showAlert("Đã thêm bình luận.", "success");
    await refreshCampaignDetail(campaignId);
  } catch (err) {
    console.error(err);
    showAlert("Thêm bình luận thất bại: " + (err?.reason || err?.message || err), "danger");
  }
}

async function likeCampaignFrontend(campaignId) {
  try {
    const c = requireContractSafely();
    const tx = await c.like(campaignId);
    await tx.wait();
    showAlert("Đã thích chiến dịch.", "success");
    await refreshCampaignDetail(campaignId);
  } catch (err) {
    console.error(err);
    showAlert("Thao tác like thất bại: " + (err?.reason || err?.message || err), "danger");
  }
}

async function unlikeCampaignFrontend(campaignId) {
  try {
    const c = requireContractSafely();
    const tx = await c.unlike(campaignId);
    await tx.wait();
    showAlert("Đã bỏ thích.", "success");
    await refreshCampaignDetail(campaignId);
  } catch (err) {
    console.error(err);
    showAlert("Thao tác unlike thất bại: " + (err?.reason || err?.message || err), "danger");
  }
}

// ---------- events ----------
function attachContractEventListeners() {
  if (!contract || eventsAttached) return;
  try {
    contract.on("DonationReceived", (campaignId, donor, amount, txHash, event) => {
      showAlert(`DonationReceived: campaign ${campaignId.toString()} - ${shaCut(donor)} - ${formatEther(amount)}`, "info", 4000);
      refreshDashboard().catch(()=>{});
    });
    contract.on("CampaignCreated", (id, creator, event) => {
      showAlert(`CampaignCreated #${Number(id.toString())} bởi ${shaCut(creator)}`, "info", 3000);
      refreshDashboard().catch(()=>{});
    });
    contract.on("Disbursed", (campaignId, recipient, amount, txHash, event) => {
      showAlert(`Đã giải ngân ${formatEther(amount)} tới ${shaCut(recipient)}`, "info", 4000);
      refreshDashboard().catch(()=>{});
    });
    contract.on("CommentAdded", (campaignId, commenter, text, event) => {
      refreshCampaignDetail(Number(campaignId.toString())).catch(()=>{});
    });
    contract.on("Liked", (campaignId, liker, event) => refreshCampaignDetail(Number(campaignId.toString())).catch(()=>{}));
    contract.on("Unliked", (campaignId, liker, event) => refreshCampaignDetail(Number(campaignId.toString())).catch(()=>{}));

    eventsAttached = true;
  } catch (e) {
    console.warn("Attach events failed", e);
  }
}

// ---------- UI refresh ----------
async function refreshDashboard() {
  try {
    if (!contract) return;
    const campaigns = await loadAllCampaigns();
    const elTotalCampaigns = document.getElementById("totalCampaigns");
    if (elTotalCampaigns) elTotalCampaigns.innerText = campaigns.length;

    // totalFunds and transactions
    let totalFunds = 0n;
    let totalTx = 0;
    // parallel requests for collected + donation count
    const rawPromises = campaigns.map(async (c) => {
      try {
        const raw = await contract.campaigns(c.id);
        const dcount = Number((await contract.getDonationsCount(c.id)).toString());
        return { raw, dcount, id: c.id };
      } catch (e) { return null; }
    });
    const raws = await Promise.all(rawPromises);
    for (const r of raws) {
      if (!r) continue;
      totalFunds += BigInt(r.raw.collected.toString() || "0");
      totalTx += r.dcount || 0;
    }
    const elTotalFunds = document.getElementById("totalFunds");
    if (elTotalFunds) elTotalFunds.innerText = formatEther(totalFunds.toString());
    const elTotalTx = document.getElementById("totalTransactions");
    if (elTotalTx) elTotalTx.innerText = totalTx;

    // recent activity (collect limited items)
    const recent = [];
    for (const c of campaigns) {
      const dcount = Number((await contract.getDonationsCount(c.id)).toString());
      for (let i = Math.max(0, dcount - 3); i < dcount; i++) {
        try {
          const d = await contract.getDonation(c.id, i);
          recent.push({ type: "donation", campaignId: c.id, donor: d.donor, amount: formatEther(d.amount), ts: Number(d.timestamp.toString()) });
        } catch(e){}
      }
      const disCount = Number((await contract.getDisbursementsCount(c.id)).toString());
      for (let i = Math.max(0, disCount - 3); i < disCount; i++) {
        try {
          const dis = await contract.getDisbursement(c.id, i);
          recent.push({ type: "disburse", campaignId: c.id, recipient: dis.recipient, amount: formatEther(dis.amount), ts: Number(dis.timestamp.toString())});
        } catch(e){}
      }
    }
    recent.sort((a,b) => (b.ts || 0) - (a.ts || 0));
    const recentEl = document.getElementById("recentActivity");
    if (recentEl) {
      recentEl.innerHTML = "";
      if (recent.length === 0) {
        recentEl.innerHTML = `<p class="text-muted">Chưa có hoạt động</p>`;
      } else {
        recent.slice(0,7).forEach(r => {
          const time = r.ts ? new Date(r.ts * 1000).toLocaleString() : "-";
          if (r.type === "donation") {
            recentEl.innerHTML += `<div class="mb-2"><strong>Donation</strong> #${r.campaignId} — ${r.amount} ETH từ ${shaCut(r.donor)} <small class="text-muted">(${time})</small></div>`;
          } else {
            recentEl.innerHTML += `<div class="mb-2"><strong>Disburse</strong> #${r.campaignId} — ${r.amount} ETH tới ${shaCut(r.recipient)} <small class="text-muted">(${time})</small></div>`;
          }
        });
      }
    }

    // campaigns list
    const campaignsList = document.getElementById("campaignsList");
    if (campaignsList) {
      campaignsList.innerHTML = "";
      for (const c of campaigns) {
        const card = document.createElement("div");
        card.className = "col-md-4";
        card.innerHTML = `
          <div class="card h-100">
            <div class="card-body d-flex flex-column">
              <h5 class="card-title">${escapeHtml(c.title)}</h5>
              <p class="card-text text-truncate">${escapeHtml(c.description || "")}</p>
              <p class="mb-1"><small>Đã thu: ${c.collected} / ${c.targetAmount} ETH</small></p>
              <p class="mb-2"><small>Wallet: ${shaCut(c.campaignWallet || "")}</small></p>
              <div class="mt-auto">
                <button class="btn btn-sm btn-primary" onclick="openCampaignDetail(${c.id})">Xem</button>
                <button class="btn btn-sm btn-outline-secondary" onclick="prefillDisburse(${c.id})">Giải ngân</button>
              </div>
            </div>
          </div>
        `;
        campaignsList.appendChild(card);
      }
    }
  } catch (e) {
    console.error("refreshDashboard error", e);
  }
}

async function refreshCampaignDetail(campaignId) {
  try {
    const c = await getCampaign(campaignId);
    console.log("Campaign detail", c);
  } catch (e) {
    console.error(e);
  }
}

// ---------- small UI helpers ----------
async function checkAdminStatus() {
  if (!contract || !currentAccount) {
    showAlert("Vui lòng kết nối ví trước.", "warning");
    return;
  }
  
  try {
    // Kiểm tra network trước
    const network = await provider.getNetwork();
    console.log("Current network:", network.chainId);
    
    if (network.chainId !== 71n) {
      showAlert(`⚠️ Sai network! Hiện tại: ${network.chainId}. Vui lòng chuyển sang Conflux eSpace Testnet (71)`, "warning", 8000);
      return;
    }
    
    // Kiểm tra contract
    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (!code || code === "0x") {
      showAlert("❌ Contract không tồn tại!", "danger");
      return;
    }
    
    // Test contract responsiveness
    const nextId = await contract.nextCampaignId();
    console.log("Contract responsive, nextCampaignId:", nextId.toString());
    
    const owner = await contract.owner();
    const isAdmin = await contract.isAdmin(currentAccount);
    
    // Cập nhật UI
    const ownerEl = document.getElementById("contractOwner");
    const addressEl = document.getElementById("currentAddress");
    const statusEl = document.getElementById("currentAdminStatus");
    const contractAddrEl = document.getElementById("contractAddress");
    
    if (ownerEl) ownerEl.textContent = `${owner} ${owner.toLowerCase() === currentAccount.toLowerCase() ? '(Bạn)' : ''}`;
    if (addressEl) addressEl.textContent = shaCut(currentAccount);
    if (statusEl) {
      statusEl.className = `badge ${isAdmin ? 'bg-success' : 'bg-warning'}`;
      statusEl.textContent = isAdmin ? 'ADMIN' : 'USER';
    }
    if (contractAddrEl) contractAddrEl.textContent = CONTRACT_ADDRESS;
    
    showAlert(`✅ Trạng thái: ${isAdmin ? 'Admin' : 'User'}. Owner: ${shaCut(owner)}`, "info", 3000);
  } catch (err) {
    console.error("Check admin status error:", err);
    showAlert("❌ Lỗi kiểm tra trạng thái: " + (err?.reason || err?.message || err), "danger");
  }
}

async function openCampaignDetail(id) {
  await refreshCampaignDetail(id);
  showAlert(`Đang tải chi tiết chiến dịch #${id}`, "info", 2500);
}
function prefillDisburse(campaignId) {
  const sel = document.getElementById("disburseCampaign");
  if (!sel) return;
  if (![...sel.options].some(o => o.value == campaignId)) {
    const opt = document.createElement("option");
    opt.value = campaignId;
    opt.text = `Chiến dịch #${campaignId}`;
    sel.appendChild(opt);
  }
  sel.value = campaignId;
  showAlert(`Đã chọn chiến dịch #${campaignId} cho form giải ngân`, "info", 1800);
}

// ---------- upload placeholder ----------
async function uploadToIPFS(file) {
  console.warn("uploadToIPFS not implemented.");
  return null;
}

// ---------- bind UI ----------
function bindUI() {
  const walletEl = document.getElementById("adminWallet");
  if (walletEl) walletEl.addEventListener("click", connectMetaMask);
  const localBtn = document.getElementById("connectLocalBtn");
  if (localBtn) localBtn.addEventListener("click", () => connectLocalRPC());
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", disconnectWallet);
  const switchNetworkBtn = document.getElementById("switchNetworkBtn");
  if (switchNetworkBtn) switchNetworkBtn.addEventListener("click", async () => {
    const success = await switchToConfluxNetwork();
    if (success) {
      showAlert("Đã chuyển sang Conflux network thành công!", "success");
      switchNetworkBtn.style.display = "none";
      // Reload contract connection
      if (currentAccount) {
        await connectMetaMask();
      }
    }
  });

  const form = document.getElementById("campaignForm");
  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const title = document.getElementById("campaignTitle").value.trim();
      const description = document.getElementById("campaignContent").value.trim();
      const targetAmount = document.getElementById("campaignTargetAmount").value;
      const province = document.getElementById("campaignProvince").value.trim();
      const district = document.getElementById("campaignDistrict").value.trim();
      const ward = document.getElementById("campaignWard").value.trim();
      const contractAddr = document.getElementById("campaignContractAddress").value.trim();

      const fileInput = document.getElementById("campaignImage");
      let mediaUrl = "";
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        showAlert("Đang upload media... (placeholder)", "info", 3000);
        const uploaded = await uploadToIPFS(file);
        mediaUrl = uploaded || "";
      }

      const location = `${province}${district ? ", "+district : ""}${ward ? ", "+ward : ""}`;

      await createCampaignFrontend({
        title,
        description,
        media: mediaUrl,
        location,
        targetAmount,
        campaignWallet: contractAddr || ethers.ZeroAddress
      });
      form.reset();
    });
  }

  const disForm = document.getElementById("disburseForm");
  if (disForm) {
    disForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const campaignId = Number(document.getElementById("disburseCampaign").value);
      const amount = document.getElementById("disburseAmount").value;
      const recipient = document.getElementById("disburseRecipient").value.trim();
      if (!campaignId || !amount || !recipient) { showAlert("Vui lòng điền đầy đủ thông tin.", "warning"); return; }
      await disburseFromContractFrontend(campaignId, recipient, amount);
      disForm.reset();
    });
  }

  const adminForm = document.getElementById("adminForm");
  if (adminForm) {
    adminForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const address = document.getElementById("adminAddress").value.trim();
      const isAdmin = document.querySelector('input[name="adminAction"]:checked').value === "true";
      
      if (!address) { 
        showAlert("Vui lòng nhập địa chỉ ví.", "warning"); 
        return; 
      }
      
      if (!ethers.isAddress(address)) {
        showAlert("Địa chỉ ví không hợp lệ.", "warning");
        return;
      }
      
      await setAdminFrontend(address, isAdmin);
      adminForm.reset();
      // Refresh status after change
      setTimeout(checkAdminStatus, 2000);
    });
  }
}

// ---------- init ----------
window.addEventListener("load", async () => {
  await loadAbi();
  bindUI();
  if (typeof ethers === 'undefined') {
    showAlert("Cảnh báo: ethers.js chưa được tải. Kiểm tra script tag.", "warning", 8000);
  } else {
    if (!provider && window.ethereum) provider = new ethers.BrowserProvider(window.ethereum);
    try {
      if (provider && CONTRACT_ADDRESS && CONTRACT_ABI) {
        const readonlyContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        try {
          const nextId = await readonlyContract.nextCampaignId();
          if (Number(nextId.toString()) > 1) {
            contract = readonlyContract; // readonly for initial listing
            await refreshDashboard();
          }
        } catch(e){}
      }
    } catch(e){ console.warn("init read-only failed", e); }
  }
});

// expose for debug
window.connectMetaMask = connectMetaMask;
window.connectLocalRPC = connectLocalRPC;
window.disconnectWallet = disconnectWallet;
window.switchToConfluxNetwork = switchToConfluxNetwork;
window.loadAllCampaigns = loadAllCampaigns;
window.createCampaignFrontend = createCampaignFrontend;
window.donateToCampaign = donateToCampaign;
window.disburseFromContractFrontend = disburseFromContractFrontend;
window.setAdminFrontend = setAdminFrontend;
window.likeCampaignFrontend = likeCampaignFrontend;
window.unlikeCampaignFrontend = unlikeCampaignFrontend;
window.addCommentFrontend = addCommentFrontend;
window.openCampaignDetail = openCampaignDetail;
window.checkAdminStatus = checkAdminStatus;
