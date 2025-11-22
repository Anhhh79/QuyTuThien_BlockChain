import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import * as readline from 'readline';

// Định nghĩa Conflux eSpace Testnet
const confluxTestnet = defineChain({
  id: 71,
  name: 'Conflux eSpace Testnet',
  network: 'cfx-testnet',
  nativeCurrency: { name: 'Conflux', symbol: 'CFX', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmtestnet.confluxrpc.com'] } },
  blockExplorers: { default: { name: 'ConfluxScan', url: 'https://evmtestnet.confluxscan.io' } },
});

const PRIVATE_KEY = "0xa3e0672445a0a6b383cdb10d9f3ab4cf612d21b3c0f37f691b3e8ca34b39538e";
const CONTRACT_ADDRESS = "0xD09bf13AaFba0Cb3e0a0d5556eF75C4Bd69fe340";

const CONTRACT_ABI = [
  { "inputs": [], "name": "owner", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function" },
  { "inputs": [{"internalType": "address", "name": "", "type": "address"}], "name": "isAdmin", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function" },
  { "inputs": [{"internalType": "address", "name": "account", "type": "address"}, {"internalType": "bool", "name": "allowed", "type": "bool"}], "name": "setAdmin", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
] as const;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("🔑 Địa chỉ owner:", account.address);
  
  const publicClient = createPublicClient({ chain: confluxTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: confluxTestnet, transport: http() });

  try {
    // Kiểm tra owner
    const owner = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'owner',
    });
    
    console.log("📋 Contract owner:", owner);
    console.log("✅ Bạn có quyền owner:", owner.toLowerCase() === account.address.toLowerCase());
    
    if (owner.toLowerCase() !== account.address.toLowerCase()) {
      console.log("❌ Bạn không phải owner, không thể thiết lập admin!");
      rl.close();
      return;
    }
    
    // Nhập địa chỉ muốn set admin
    const targetAddress = await question("📝 Nhập địa chỉ muốn cấp quyền admin: ");
    
    if (!targetAddress || !/^0x[a-fA-F0-9]{40}$/.test(targetAddress)) {
      console.log("❌ Địa chỉ không hợp lệ!");
      rl.close();
      return;
    }
    
    // Kiểm tra trạng thái hiện tại
    const isCurrentlyAdmin = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'isAdmin',
      args: [targetAddress as `0x${string}`],
    });
    
    console.log(`📊 Trạng thái hiện tại của ${targetAddress}: ${isCurrentlyAdmin ? 'ADMIN' : 'USER'}`);
    
    const action = await question("🔧 (g)rant admin / (r)evoke admin / (c)ancel: ");
    
    let grantAdmin: boolean;
    if (action.toLowerCase() === 'g') {
      grantAdmin = true;
    } else if (action.toLowerCase() === 'r') {
      grantAdmin = false;
    } else {
      console.log("❌ Đã hủy thao tác!");
      rl.close();
      return;
    }
    
    // Thực hiện giao dịch
    console.log(`⏳ ${grantAdmin ? 'Cấp' : 'Thu hồi'} quyền admin cho ${targetAddress}...`);
    
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'setAdmin',
      args: [targetAddress as `0x${string}`, grantAdmin],
    });
    
    console.log("📝 Transaction hash:", hash);
    console.log("⏳ Đang chờ xác nhận...");
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("✅ Giao dịch thành công!");
    console.log("🔗 Block number:", receipt.blockNumber);
    
    // Kiểm tra lại trạng thái
    const newStatus = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'isAdmin',
      args: [targetAddress as `0x${string}`],
    });
    
    console.log(`🎉 Trạng thái mới của ${targetAddress}: ${newStatus ? 'ADMIN' : 'USER'}`);
    
  } catch (error) {
    console.error("❌ Lỗi:", error);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
