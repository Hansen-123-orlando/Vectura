// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

///  - Decentralized Ride Sharing 
///  Contract ini menangani pendaftaran driver, pemesanan, dan sistem escrow pembayaran.
contract Vectura {

    // --- STRUKTUR DATA ---

    // Definisi status pesanan
    enum RideStatus { 
        Requested,          // Pesanan dibuat penumpang
        Accepted,           // Diambil oleh driver
        Funded,             // Uang sudah masuk ke contract (Escrow)
        CompletedByDriver,  // Driver sampai tujuan
        Finalized,          // Penumpang konfirmasi, dana cair
        Cancelled           // Pesanan dibatalkan
    }

    struct Driver {
        string name;
        string licensePlate; 
        string vehicleType;  // Tipe Kendaraan
        uint256 rate;        // Tarif
        bool isRegistered;
    }

    struct Ride {
        uint256 rideId;
        address payable passenger; // Address penumpang (harus payable untuk refund)
        address payable driver;    // Address driver (harus payable untuk terima gaji)
        string pickupLocation;
        string destination;
        uint256 price;             // Harga yang disepakati (dalam Wei)
        string notes;
        RideStatus status;
    }

    // --- STATE VARIABLES ---
    
    mapping(address => Driver) public drivers; // Database Driver
    Ride[] public rides;                       // Database Pesanan
    uint256 public rideCount = 0;              // Counter ID Pesanan

    // --- EVENTS ---
    event DriverRegistered(address indexed driverAddress, string name);
    event RideRequested(uint256 indexed rideId, address indexed passenger, uint256 price);
    event RideAccepted(uint256 indexed rideId, address indexed driver);
    event RideFunded(uint256 indexed rideId, uint256 amount);
    event RideCompleted(uint256 indexed rideId);
    event RideFinalized(uint256 indexed rideId, uint256 amountTransferred);
    event RideCancelled(uint256 indexed rideId);

    // --- MODIFIERS ---
    modifier onlyDriver() {
        require(drivers[msg.sender].isRegistered, "Hanya driver terdaftar yang bisa akses ini");
        _;
    }

    // ==========================================
    // BAGIAN A: DATA PENGEMUDI
    // ==========================================

    ///  Mendaftarkan diri sebagai pengemudi
    function registerDriver(string memory _name, string memory _licensePlate, string memory _vehicleType, uint256 _rate) public {
        require(!drivers[msg.sender].isRegistered, "Anda sudah terdaftar sebagai driver");

        drivers[msg.sender] = Driver(_name, _licensePlate, _vehicleType, _rate, true);
        
        emit DriverRegistered(msg.sender, _name);
    }

    ///  Melihat data pengemudi berdasarkan address
    function getDriver(address _driverAddr) public view returns (string memory, string memory, string memory, uint256) {
        require(drivers[_driverAddr].isRegistered, "Driver tidak ditemukan");
        Driver memory d = drivers[_driverAddr];
        return (d.name, d.licensePlate, d.vehicleType, d.rate);
    }

    // ==========================================
    // BAGIAN B: PEMESANAN PERJALANAN
    // ==========================================

    /// Penumpang membuat pesanan baru
    function requestRide(string memory _pickup, string memory _destination, uint256 _price, string memory _notes) public {
        require(_price > 0, "Harga harus lebih dari 0");

        Ride memory newRide = Ride({
            rideId: rideCount,
            passenger: payable(msg.sender),
            driver: payable(address(0)),
            pickupLocation: _pickup,
            destination: _destination,
            price: _price,
            notes: _notes,
            status: RideStatus.Requested
        });

        rides.push(newRide);
        emit RideRequested(rideCount, msg.sender, _price);
        
        rideCount++; 
    }

    ///Pengemudi menerima pesanan yang tersedia
    function acceptRide(uint256 _rideId) public onlyDriver {
        Ride storage ride = rides[_rideId];
        
        require(ride.status == RideStatus.Requested, "Status pesanan tidak valid untuk diambil");
        
        ride.driver = payable(msg.sender); 
        ride.status = RideStatus.Accepted; 
        
        emit RideAccepted(_rideId, msg.sender);
    }

    // ==========================================
    // BAGIAN C: ATURAN DANA (ESCROW)
    // ==========================================

    /// Penumpang membayar biaya ke Smart Contract (Escrow)
    function fundRide(uint256 _rideId) public payable {
        Ride storage ride = rides[_rideId];

        require(msg.sender == ride.passenger, "Hanya penumpang asli yang boleh membayar");
        require(ride.status == RideStatus.Accepted, "Driver harus terima order dulu sebelum bayar");
        require(msg.value == ride.price, "Jumlah ETH yang dikirim tidak sesuai harga");

        ride.status = RideStatus.Funded;
        
        emit RideFunded(_rideId, msg.value);
    }

    ///  Driver menyatakan perjalanan dimulai dan selesai
    function completeRide(uint256 _rideId) public {
        Ride storage ride = rides[_rideId];

        require(msg.sender == ride.driver, "Hanya driver yang bertugas yang bisa akses");
        require(ride.status == RideStatus.Funded, "Dana belum masuk (Funded), tidak bisa jalan");

        ride.status = RideStatus.CompletedByDriver;
        
        emit RideCompleted(_rideId);
    }

    ///  Penumpang konfirmasi sampai, DANA CAIR KE DRIVER
    function confirmArrival(uint256 _rideId) public {
        Ride storage ride = rides[_rideId];

        require(msg.sender == ride.passenger, "Hanya penumpang yang bisa konfirmasi");
        require(ride.status == RideStatus.CompletedByDriver, "Driver belum menyelesaikan perjalanan");

        ride.status = RideStatus.Finalized;

        (bool success, ) = ride.driver.call{value: ride.price}("");
        require(success, "Transfer ke driver gagal");

        emit RideFinalized(_rideId, ride.price);
    }

    ///  Membatalkan pesanan (Refund logic)
    function cancelRide(uint256 _rideId) public {
        Ride storage ride = rides[_rideId];
        
        require(msg.sender == ride.passenger || msg.sender == ride.driver, "Akses ditolak");
        require(ride.status == RideStatus.Requested || ride.status == RideStatus.Accepted || ride.status == RideStatus.Funded, "Status tidak bisa cancel");

        if (ride.status == RideStatus.Funded) {
             ride.status = RideStatus.Cancelled;
             (bool success, ) = ride.passenger.call{value: ride.price}("");
             require(success, "Refund gagal");
        } else {
             ride.status = RideStatus.Cancelled;
        }

        emit RideCancelled(_rideId);
    }
}