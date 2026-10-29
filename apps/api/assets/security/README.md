# App-attestation trust material

`apple-app-attest-root.pem` is the public Apple App Attestation Root CA certificate retrieved on 2026-10-20 from [Apple's certificate authority](https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem).

The SHA-256 digest of its DER certificate is `1cb9823ba28ba6ad2d33a006941de2ae4f513ef1d4e831b9f7e0fa7b6242c932`. The factory checks this exact digest before constructing the verifier. The certificate expires on 2045-03-15. Replacement requires source review and refreshed verification; client-supplied roots are not accepted by the factory.

This public certificate contains no private key or account credential. See [implementation boundaries](../../../../docs/APP-ATTESTATION.md) before connecting the verification primitives to requests.

`apple-root-g3.pem` is the public Apple Root CA G3 certificate, retrieved on 2026-10-20 from [Apple's certificate authority](https://www.apple.com/certificateauthority/AppleRootCA-G3.cer). Its DER SHA-256 is `63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179`, and it expires on 2039-04-30. Apple's published App Attest fraud receipt chains to this root. The receipt factory pins this fingerprint separately from the App Attestation Root CA and also requires the receipt-specific signing-certificate extension `1.2.840.113635.100.12.15`; general Apple trust alone is insufficient.
