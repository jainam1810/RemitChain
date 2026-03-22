// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// MOCK CONTRACTS (for testing only)

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(
            allowance[from][msg.sender] >= amount,
            "Insufficient allowance"
        );
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract MockPriceFeed {
    int256 public price;
    uint8 public decimals = 8;

    constructor(int256 _price) {
        price = _price;
    }

    function updatePrice(int256 _newPrice) external {
        price = _newPrice;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, price, block.timestamp, block.timestamp, 1);
    }
}

// INTERFACES

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80);
    function decimals() external view returns (uint8);
}

interface IERC20 {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

// MAIN CONTRACT — RemitChain V3
// Features: Two-Phase Claim, Multi-Currency, Emergency Freeze,
//           Notification Events

contract RemitChain {
    // ---- State Variables ----
    address public owner;
    uint256 public feePercent = 30; // 0.3% (30 basis points)
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public totalFeesCollected;
    uint256 public gracePeriod = 5 minutes;
    bool public paused = false; // Emergency freeze

    // Supported tokens: address => currency symbol (e.g., "USD", "GBP", "EUR")
    mapping(address => bool) public supportedTokens;
    mapping(address => string) public tokenCurrency;

    // Price feeds: "USD/GBP" => Chainlink aggregator address
    mapping(string => address) public priceFeeds;

    // Supported currency pairs list (for UI enumeration)
    string[] public supportedPairs;
    mapping(string => bool) public pairExists;

    // Transfer statuses
    enum TransferStatus {
        Pending,
        Claimed,
        Finalized,
        Completed,
        Reversed,
        Refunded
    }

    struct Transfer {
        uint256 id;
        address sender;
        address recipient;
        address sourceToken;
        address destinationToken;
        uint256 sourceAmount;
        uint256 destinationAmount;
        uint256 fee;
        uint256 exchangeRate;
        string currencyPair;
        TransferStatus status;
        uint256 createdAt;
        uint256 claimedAt;
        uint256 completedAt;
    }

    uint256 public transferCount;
    mapping(uint256 => Transfer) public transfers;
    mapping(address => uint256[]) public userTransfers;

    // ---- Events (also serve as notifications) ----

    // Core transfer events
    event TransferInitiated(
        uint256 indexed transferId,
        address indexed sender,
        address indexed recipient,
        uint256 sourceAmount,
        uint256 destinationAmount,
        string currencyPair
    );
    event TransferClaimed(
        uint256 indexed transferId,
        address indexed recipient,
        uint256 finalizesAt
    );
    event TransferWithdrawn(
        uint256 indexed transferId,
        address indexed recipient,
        uint256 amount
    );
    event TransferReversed(
        uint256 indexed transferId,
        address indexed sender,
        uint256 refundAmount
    );
    event TransferRefunded(
        uint256 indexed transferId,
        address indexed sender,
        uint256 refundAmount
    );

    // Notification events (UI listens to these for real-time alerts)
    event NotifyRecipient(
        address indexed recipient,
        uint256 indexed transferId,
        string message,
        uint256 amount,
        string currency
    );
    event NotifySender(
        address indexed sender,
        uint256 indexed transferId,
        string message
    );

    // Admin events
    event ContractPaused(address indexed by, string reason);
    event ContractUnpaused(address indexed by);
    event CurrencyAdded(
        address indexed token,
        string currency,
        string pairAdded
    );
    event PriceFeedUpdated(string pair, address feed);

    // ---- Modifiers ----

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused - emergency freeze active");
        _;
    }

    // ---- Constructor ----

    constructor() {
        owner = msg.sender;
    }

    // ADMIN FUNCTIONS

    /// @notice Add a supported token with its currency label
    function addSupportedToken(
        address _token,
        string calldata _currency
    ) external onlyOwner {
        supportedTokens[_token] = true;
        tokenCurrency[_token] = _currency;
    }

    /// @notice Set price feed for a currency pair and register the pair
    function setPriceFeed(
        string calldata _pair,
        address _feed
    ) external onlyOwner {
        priceFeeds[_pair] = _feed;
        if (!pairExists[_pair]) {
            supportedPairs.push(_pair);
            pairExists[_pair] = true;
        }
        emit PriceFeedUpdated(_pair, _feed);
    }

    function setFeePercent(uint256 _newFeePercent) external onlyOwner {
        require(_newFeePercent <= 100, "Fee too high");
        feePercent = _newFeePercent;
    }

    function setGracePeriod(uint256 _seconds) external onlyOwner {
        require(_seconds <= 30 minutes, "Too long");
        gracePeriod = _seconds;
    }

    /// @notice EMERGENCY FREEZE - pause all transfers
    function pauseContract(string calldata _reason) external onlyOwner {
        paused = true;
        emit ContractPaused(msg.sender, _reason);
    }

    /// @notice Resume operations after emergency
    function unpauseContract() external onlyOwner {
        paused = false;
        emit ContractUnpaused(msg.sender);
    }

    /// @notice Get number of supported pairs
    function getSupportedPairsCount() external view returns (uint256) {
        return supportedPairs.length;
    }

    /// @notice Get all supported pairs
    function getAllSupportedPairs() external view returns (string[] memory) {
        return supportedPairs;
    }

    // CORE TRANSFER LOGIC

    /// @notice Phase 1: Sender initiates transfer
    function initiateTransfer(
        address _recipient,
        address _sourceToken,
        address _destinationToken,
        uint256 _amount,
        string calldata _currencyPair
    ) external whenNotPaused {
        require(_recipient != address(0), "Zero address");
        require(_recipient != msg.sender, "Cannot send to yourself");
        require(supportedTokens[_sourceToken], "Source token not supported");
        require(supportedTokens[_destinationToken], "Dest token not supported");
        require(_amount > 0, "Amount must be > 0");
        require(priceFeeds[_currencyPair] != address(0), "Price feed not set");

        bool success = IERC20(_sourceToken).transferFrom(
            msg.sender,
            address(this),
            _amount
        );
        require(success, "Token transfer failed");

        uint256 rate = getExchangeRate(_currencyPair);
        uint256 fee = (_amount * feePercent) / FEE_DENOMINATOR;
        uint256 amountAfterFee = _amount - fee;
        uint256 destinationAmount = (amountAfterFee * rate) / 1e8;

        totalFeesCollected += fee;
        transferCount++;

        transfers[transferCount] = Transfer({
            id: transferCount,
            sender: msg.sender,
            recipient: _recipient,
            sourceToken: _sourceToken,
            destinationToken: _destinationToken,
            sourceAmount: _amount,
            destinationAmount: destinationAmount,
            fee: fee,
            exchangeRate: rate,
            currencyPair: _currencyPair,
            status: TransferStatus.Pending,
            createdAt: block.timestamp,
            claimedAt: 0,
            completedAt: 0
        });

        userTransfers[msg.sender].push(transferCount);
        userTransfers[_recipient].push(transferCount);

        emit TransferInitiated(
            transferCount,
            msg.sender,
            _recipient,
            _amount,
            destinationAmount,
            _currencyPair
        );

        // Notify recipient
        string memory destCurrency = tokenCurrency[_destinationToken];
        emit NotifyRecipient(
            _recipient,
            transferCount,
            "You received a new transfer!",
            destinationAmount,
            destCurrency
        );
    }

    /// @notice Phase 2: Recipient claims (starts grace period)
    function claimTransfer(uint256 _transferId) external whenNotPaused {
        Transfer storage t = transfers[_transferId];
        require(t.status == TransferStatus.Pending, "Not pending");
        require(msg.sender == t.recipient, "Only recipient");

        t.status = TransferStatus.Claimed;
        t.claimedAt = block.timestamp;

        uint256 finalizesAt = block.timestamp + gracePeriod;
        emit TransferClaimed(_transferId, t.recipient, finalizesAt);

        // Notify sender that recipient claimed
        emit NotifySender(
            t.sender,
            _transferId,
            "Recipient claimed your transfer. Grace period started."
        );
    }

    /// @notice Phase 3a: Sender reverses during grace period
    function reverseTransfer(uint256 _transferId) external whenNotPaused {
        Transfer storage t = transfers[_transferId];
        require(t.status == TransferStatus.Claimed, "Not claimed");
        require(msg.sender == t.sender, "Only sender");
        require(
            block.timestamp <= t.claimedAt + gracePeriod,
            "Grace period expired"
        );

        t.status = TransferStatus.Reversed;

        uint256 refundAmount = t.sourceAmount - t.fee;
        bool success = IERC20(t.sourceToken).transfer(t.sender, refundAmount);
        require(success, "Refund failed");

        emit TransferReversed(_transferId, t.sender, refundAmount);

        // Notify recipient that transfer was reversed
        emit NotifyRecipient(
            t.recipient,
            _transferId,
            "Transfer was reversed by sender.",
            0,
            ""
        );
    }

    /// @notice Phase 3b: Recipient withdraws after grace period
    function withdrawTransfer(uint256 _transferId) external whenNotPaused {
        Transfer storage t = transfers[_transferId];
        require(t.status == TransferStatus.Claimed, "Not claimed");
        require(msg.sender == t.recipient, "Only recipient");
        require(
            block.timestamp > t.claimedAt + gracePeriod,
            "Grace period not over"
        );

        t.status = TransferStatus.Completed;
        t.completedAt = block.timestamp;

        uint256 balance = IERC20(t.destinationToken).balanceOf(address(this));
        require(balance >= t.destinationAmount, "Insufficient liquidity");

        bool success = IERC20(t.destinationToken).transfer(
            t.recipient,
            t.destinationAmount
        );
        require(success, "Withdrawal failed");

        emit TransferWithdrawn(_transferId, t.recipient, t.destinationAmount);

        // Notify sender that transfer completed
        emit NotifySender(
            t.sender,
            _transferId,
            "Transfer completed. Recipient withdrew funds."
        );
    }

    /// @notice Refund before claim (by sender)
    function refundTransfer(uint256 _transferId) external whenNotPaused {
        Transfer storage t = transfers[_transferId];
        require(t.status == TransferStatus.Pending, "Not pending");
        require(msg.sender == t.sender, "Only sender");

        t.status = TransferStatus.Refunded;
        uint256 refundAmount = t.sourceAmount - t.fee;

        bool success = IERC20(t.sourceToken).transfer(t.sender, refundAmount);
        require(success, "Refund failed");

        emit TransferRefunded(_transferId, t.sender, refundAmount);

        // Notify recipient that transfer was cancelled
        emit NotifyRecipient(
            t.recipient,
            _transferId,
            "Transfer was cancelled by sender before you claimed.",
            0,
            ""
        );
    }

    // VIEW FUNCTIONS

    function getExchangeRate(
        string memory _currencyPair
    ) public view returns (uint256) {
        address feedAddress = priceFeeds[_currencyPair];
        require(feedAddress != address(0), "No price feed");

        AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
        (, int256 answer, , uint256 updatedAt, ) = priceFeed.latestRoundData();

        require(answer > 0, "Invalid price");
        require(updatedAt > block.timestamp - 1 hours, "Stale price");

        return uint256(answer);
    }

    function getQuote(
        uint256 _amount,
        string calldata _currencyPair
    ) external view returns (uint256 destinationAmount, uint256 fee) {
        uint256 rate = getExchangeRate(_currencyPair);
        fee = (_amount * feePercent) / FEE_DENOMINATOR;
        uint256 amountAfterFee = _amount - fee;
        destinationAmount = (amountAfterFee * rate) / 1e8;
    }

    function getUserTransfers(
        address _user
    ) external view returns (uint256[] memory) {
        return userTransfers[_user];
    }

    function getTransferDetails(
        uint256 _transferId
    ) external view returns (Transfer memory) {
        return transfers[_transferId];
    }

    function getGraceTimeRemaining(
        uint256 _transferId
    ) external view returns (uint256) {
        Transfer storage t = transfers[_transferId];
        if (t.status != TransferStatus.Claimed) return 0;
        uint256 deadline = t.claimedAt + gracePeriod;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    function withdrawFees(address _token, uint256 _amount) external onlyOwner {
        require(_amount <= totalFeesCollected, "Exceeds fees");
        totalFeesCollected -= _amount;
        bool success = IERC20(_token).transfer(owner, _amount);
        require(success, "Withdrawal failed");
    }
}
