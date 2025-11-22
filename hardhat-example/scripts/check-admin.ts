import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

// Định nghĩa Conflux eSpace Testnet
const confluxTestnet = defineChain({
  id: 71,
  name: 'Conflux eSpace Testnet',
  network: 'cfx-testnet',
  nativeCurrency: {
    name: 'Conflux',
    symbol: 'CFX',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://evmtestnet.confluxrpc.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ConfluxScan',
      url: 'https://evmtestnet.confluxscan.io',
    },
  },
});

const PRIVATE_KEY = "0xa3e0672445a0a6b383cdb10d9f3ab4cf612d21b3c0f37f691b3e8ca34b39538e";
const CONTRACT_ADDRESS = "0xD09bf13AaFba0Cb3e0a0d5556eF75C4Bd69fe340";

// ABI chỉ cần các function cần thiết
const CONTRACT_ABI = [
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "", "type": "address"}],
    "name": "isAdmin",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "account", "type": "address"},
      {"internalType": "bool", "name": "allowed", "type": "bool"}
    ],
    "name": "setAdmin",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

async function main() {
  // Tạo account từ private key
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Địa chỉ ví:", account.address);
  
  // Tạo client
  const publicClient = createPublicClient({
    chain: confluxTestnet,
    transport: http(),
  });
  
  const walletClient = createWalletClient({
    account,
    chain: confluxTestnet,
    transport: http(),
  });

  try {
    // Kiểm tra owner của contract
    const owner = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'owner',
    });
    console.log("Owner của contract:", owner);
    
    // Kiểm tra xem địa chỉ hiện tại có phải admin không
    const isCurrentAdmin = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'isAdmin',
      args: [account.address],
    });
    console.log("Địa chỉ hiện tại có phải admin:", isCurrentAdmin);
    
    // Nếu địa chỉ hiện tại là owner nhưng không phải admin, thì set admin
    if (owner.toLowerCase() === account.address.toLowerCase() && !isCurrentAdmin) {
      console.log("Đang thiết lập admin cho địa chỉ hiện tại...");
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'setAdmin',
        args: [account.address, true],
      });
      console.log("Transaction hash:", hash);
      console.log("Đã thiết lập admin thành công!");
    } else if (isCurrentAdmin) {
      console.log("Địa chỉ hiện tại đã là admin!");
    } else {
      console.log("Địa chỉ hiện tại không phải owner, không thể tự set admin.");
      console.log("Hãy liên hệ owner để được cấp quyền admin.");
    }
    
  } catch (error) {
    console.error("Lỗi:", error);
  }
}

main().catch(console.error);
