import {
    Htj2kDecoder,
    Jpeg2000Decoder,
    JpegDecoder,
    JpegLosslessDecoder,
    JpegLsDecoder,
    RleCodec,
} from "./src/index-codecs";

async function verifyCodec(
    name: string,
    codec: any,
    method: string = "decode"
) {
    console.log(`Verifying ${name}...`);
    try {
        if (method === "decode") {
            // Pass minimal data to trigger WASM init
            // It will fail to decode, but should pass init
            await codec.decode([new Uint8Array(10)], {});
        } else {
            await codec.encode(
                new Uint8Array(10),
                "1.2.840.10008.1.2.5",
                1,
                1,
                1,
                8
            );
        }
        console.log(
            `✅ ${name} initialized and ran (unexpected success on junk data?)`
        );
    } catch (e: any) {
        const msg = e.message || String(e);
        if (
            msg.includes("not initialized") ||
            msg.includes("Failed to init") ||
            msg.includes("is not a function") ||
            msg.includes("module not found") ||
            msg.includes("Cannot find module")
        ) {
            console.error(`❌ ${name} FAILED TO INIT:`, e);
            process.exit(1);
        } else {
            console.log(
                `✅ ${name} initialized (failed to decode as expected: ${msg})`
            );
        }
    }
}

async function main() {
    console.log("Starting Codec Verification...");

    // JPEG
    await verifyCodec("JPEG", new JpegDecoder());

    // JPEG 2000
    await verifyCodec("JPEG 2000", new Jpeg2000Decoder());

    // JPEG-LS
    await verifyCodec("JPEG-LS", new JpegLsDecoder());

    // RLE
    // RLE is robust, it might actually decode junk as "valid" RLE or just fail logic.
    await verifyCodec("RLE", new RleCodec());

    // HTJ2K
    await verifyCodec("HTJ2K", new Htj2kDecoder());

    // JPEG Lossless (LJPEG)
    await verifyCodec("LJPEG", new JpegLosslessDecoder());

    console.log("All codecs verified!");
}

main().catch(e => {
    console.error("Verification script failed:", e);
    process.exit(1);
});
