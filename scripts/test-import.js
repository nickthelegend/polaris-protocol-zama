try {
    const relayer = require("@zama-fhe/relayer-sdk");
    console.log("Success! Relayer SDK keys:", Object.keys(relayer));
} catch (e) {
    console.error("Failed to import @zama-fhe/relayer-sdk:", e);
}
