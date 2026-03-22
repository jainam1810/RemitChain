const hre = require("hardhat");

async function main() {
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const MockPriceFeed = await hre.ethers.getContractFactory("MockPriceFeed");
    const RemitChain = await hre.ethers.getContractFactory("RemitChain");

    const usdc = await MockERC20.deploy("USD Coin", "USDC");
    await usdc.waitForDeployment();
    console.log("USDC deployed:", await usdc.getAddress());

    const gbpt = await MockERC20.deploy("GBP Token", "GBPT");
    await gbpt.waitForDeployment();
    console.log("GBPT deployed:", await gbpt.getAddress());

    const eurt = await MockERC20.deploy("EUR Token", "EURT");
    await eurt.waitForDeployment();
    console.log("EURT deployed:", await eurt.getAddress());

    const inrt = await MockERC20.deploy("INR Token", "INRT");
    await inrt.waitForDeployment();
    console.log("INRT deployed:", await inrt.getAddress());

    const jpyt = await MockERC20.deploy("JPY Token", "JPYT");
    await jpyt.waitForDeployment();
    console.log("JPYT deployed:", await jpyt.getAddress());

    const feedUsdUsd = await MockPriceFeed.deploy(100000000);
    await feedUsdUsd.waitForDeployment();
    console.log("USD/USD Feed:", await feedUsdUsd.getAddress());

    const feedUsdGbp = await MockPriceFeed.deploy(79000000);
    await feedUsdGbp.waitForDeployment();
    console.log("USD/GBP Feed:", await feedUsdGbp.getAddress());

    const feedUsdEur = await MockPriceFeed.deploy(92000000);
    await feedUsdEur.waitForDeployment();
    console.log("USD/EUR Feed:", await feedUsdEur.getAddress());

    const feedUsdInr = await MockPriceFeed.deploy(8350000000);
    await feedUsdInr.waitForDeployment();
    console.log("USD/INR Feed:", await feedUsdInr.getAddress());

    const feedUsdJpy = await MockPriceFeed.deploy(15450000000);
    await feedUsdJpy.waitForDeployment();
    console.log("USD/JPY Feed:", await feedUsdJpy.getAddress());

    const remitChain = await RemitChain.deploy();
    await remitChain.waitForDeployment();
    console.log("RemitChain deployed:", await remitChain.getAddress());

    // Auto-setup
    console.log("\nRunning setup...");
    const [deployer] = await hre.ethers.getSigners();
    const rc = await hre.ethers.getContractAt("RemitChain", await remitChain.getAddress(), deployer);

    await (await rc.setGracePeriod(60)).wait();
    console.log("Grace period set to 2 minutes!");

    await (await rc.addSupportedToken(await usdc.getAddress(), "USD")).wait();
    await (await rc.addSupportedToken(await gbpt.getAddress(), "GBP")).wait();
    await (await rc.addSupportedToken(await eurt.getAddress(), "EUR")).wait();
    await (await rc.addSupportedToken(await inrt.getAddress(), "INR")).wait();
    await (await rc.addSupportedToken(await jpyt.getAddress(), "JPY")).wait();
    console.log("Tokens registered!");

    await (await rc.setPriceFeed("USD/USD", await feedUsdUsd.getAddress())).wait();
    await (await rc.setPriceFeed("USD/GBP", await feedUsdGbp.getAddress())).wait();
    await (await rc.setPriceFeed("USD/EUR", await feedUsdEur.getAddress())).wait();
    await (await rc.setPriceFeed("USD/INR", await feedUsdInr.getAddress())).wait();
    await (await rc.setPriceFeed("USD/JPY", await feedUsdJpy.getAddress())).wait();
    console.log("Price feeds set! Setup complete.");

    console.log("\n--- Save these addresses! ---");
    // Pre-fund: mint tokens to deployer wallet and add liquidity
    console.log("\nPre-funding...");
    const deployerAddr = await deployer.getAddress();
    const bigAmount = hre.ethers.parseUnits("10000000", 6);
    const rcAddr = await remitChain.getAddress();

    // Mint USDC to deployer (sender wallet)
    await (await usdc.mint(deployerAddr, bigAmount)).wait();
    console.log("Minted 100k USDC to deployer");

    // Mint all destination currencies to contract for liquidity
    await (await gbpt.mint(rcAddr, bigAmount)).wait();
    await (await eurt.mint(rcAddr, bigAmount)).wait();
    await (await inrt.mint(rcAddr, bigAmount)).wait();
    await (await jpyt.mint(rcAddr, bigAmount)).wait();
    console.log("Liquidity added for all currencies!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});