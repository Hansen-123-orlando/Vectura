// ============================================================
// BAGIAN INI WAJIB KAMU ISI DENGAN DATA DARI REMIX!
// ============================================================

// 1. Masukkan URL Infura kamu di sini (dari Langkah 1)
const INFURA_URL = "https://sepolia.infura.io/v3/b65cacb9438a4cdab3aababb8cce2452";

// 2. Masukkan Contract Address LAMA kamu di sini (Copy dari Remix)
const CONTRACT_ADDRESS = "0x48b43b9c81cdE067e27E16cc4FBc6Ce948BdAe04";

// ABI sudah dipindah ke js/ABI.js dan akan diload sebelum file ini.
// const CONTRACT_ABI = ... 

// ============================================================

let web3;
let contract;
let userAccount;

// Inisialisasi saat halaman dimuat
window.addEventListener('load', async () => {
    // SKENARIO 1: Ada MetaMask (Prioritas Utama untuk Transaksi)
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        try {
            // Minta izin akses akun
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            userAccount = accounts[0];
            document.getElementById('myAccount').innerText = userAccount;

            // Cek Network Sepolia (ID: 11155111)
            const netId = await web3.eth.net.getId();
            if (netId == 11155111) {
                document.getElementById('connStatus').innerText = "Terhubung via MetaMask (Mode Full Akses)";
                document.getElementById('connStatus').style.color = "green";
                document.getElementById('netStatus').innerText = "Sepolia Testnet";
            } else {
                document.getElementById('connStatus').innerText = "Salah Jaringan! Pindah ke Sepolia.";
                document.getElementById('connStatus').style.color = "red";
            }
        } catch (error) {
            console.error("User menolak akses MetaMask");
        }
    }
    // SKENARIO 2: Tidak ada MetaMask (Pakai Infura sesuai Soal Poin A)
    else {
        console.log("MetaMask tidak ditemukan, fallback ke Infura.");
        web3 = new Web3(new Web3.providers.HttpProvider(INFURA_URL));
        document.getElementById('connStatus').innerText = "Terhubung via Infura RPC (Mode Baca Saja)";
        document.getElementById('connStatus').style.color = "orange";
        document.getElementById('netStatus').innerText = "Sepolia (Infura)";
        document.getElementById('myAccount').innerText = "Tamu (Tanpa Wallet)";
    }

    // Load Contract
    contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

    // Load Data Awal
    loadRides();
});

// --- FUNGSI TRANSAKSI (Memanggil Smart Contract) ---

async function registerDriver() {
    const name = document.getElementById('regName').value;
    const plate = document.getElementById('regPlate').value;
    const vehicle = document.getElementById('regVehicle').value;
    const rateEth = document.getElementById('regRate').value;
    const rateWei = web3.utils.toWei(rateEth, 'ether');

    try {
        await contract.methods.registerDriver(name, plate, vehicle, rateWei)
            .send({ from: userAccount });
        alert("Registrasi Berhasil! Silakan refresh.");
        loadRides();
    } catch (err) { alert("Error: " + err.message); }
}

async function requestRide() {
    const pickup = document.getElementById('reqPickup').value;
    const dest = document.getElementById('reqDest').value;
    const priceEth = document.getElementById('reqPrice').value;
    const note = document.getElementById('reqNote').value;
    const priceWei = web3.utils.toWei(priceEth, 'ether');

    try {
        await contract.methods.requestRide(pickup, dest, priceWei, note)
            .send({ from: userAccount });
        alert("Order Terkirim!");
        loadRides();
    } catch (err) { alert("Error: " + err.message); }
}

async function acceptRide(id) {
    try {
        await contract.methods.acceptRide(id).send({ from: userAccount });
        alert("Order Diambil Driver!"); loadRides();
    } catch (err) { alert("Error: " + err.message); }
}

async function fundRide(id, amountWei) {
    try {
        // Mengirim Value (Escrow)
        await contract.methods.fundRide(id).send({ from: userAccount, value: amountWei });
        alert("Dana berhasil masuk Escrow!"); loadRides();
    } catch (err) { alert("Error: " + err.message); }
}

async function completeRide(id) {
    try {
        await contract.methods.completeRide(id).send({ from: userAccount });
        alert("Perjalanan Selesai!"); loadRides();
    } catch (err) { alert("Error: " + err.message); }
}

async function confirmArrival(id) {
    try {
        await contract.methods.confirmArrival(id).send({ from: userAccount });
        alert("Konfirmasi Sukses! Dana cair ke Driver."); loadRides();
    } catch (err) { alert("Error: " + err.message); }
}

// --- FUNGSI BACA DATA (View) ---

async function loadRides() {
    const listDiv = document.getElementById('ridesList');
    listDiv.innerHTML = "Mengambil data dari Blockchain...";

    try {
        const count = await contract.methods.rideCount().call();
        let html = "";
        const statusText = ["Requested", "Accepted", "Funded", "Completed", "Finalized", "Cancelled"];
        const colors = ["#7f8c8d", "#3498db", "#f39c12", "#9b59b6", "#27ae60", "#c0392b"];

        // Loop dari order terbaru ke terlama
        for (let i = count - 1; i >= 0; i--) {
            const r = await contract.methods.rides(i).call();
            const priceEth = web3.utils.fromWei(r.price, 'ether');

            // Logic tombol dinamis sesuai status
            let buttons = "";
            if (r.status == 0) buttons = `<button class="btn-blue" onclick="acceptRide(${r.rideId})">Driver: Terima Order (Accept)</button>`;
            else if (r.status == 1) buttons = `<button class="btn-orange" onclick="fundRide(${r.rideId}, '${r.price}')">Penumpang: Bayar (Escrow)</button>`;
            else if (r.status == 2) buttons = `<button class="btn-purple" onclick="completeRide(${r.rideId})">Driver: Selesaikan (Complete)</button>`;
            else if (r.status == 3) buttons = `<button class="btn-green" onclick="confirmArrival(${r.rideId})">Penumpang: Konfirmasi & Cairkan Dana</button>`;
            else if (r.status == 4) buttons = `<span style="color:green; font-weight:bold;">✅ Transaksi Selesai</span>`;

            html += `
                <div class="ride-card">
                    <div class="ride-header">
                        <h3>Ride #${r.rideId}</h3>
                        <span class="badge" style="background:${colors[r.status]}">${statusText[r.status]}</span>
                    </div>
                    <div class="ride-details">
                        <p><strong>📍 Rute:</strong> ${r.pickupLocation} ➝ ${r.destination}</p>
                        <p><strong>💰 Harga:</strong> ${priceEth} ETH <small>(${r.notes})</small></p>
                    </div>
                    <div class="ride-actions">
                        ${buttons}
                    </div>
                </div>`;
        }
        listDiv.innerHTML = html || "<p>Belum ada pesanan.</p>";
    } catch (err) {
        console.error(err);
        listDiv.innerHTML = "Gagal memuat data. Cek Console.";
    }
}
