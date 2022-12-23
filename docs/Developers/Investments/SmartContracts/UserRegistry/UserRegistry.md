# 📙 UserRegistry

Function ***`changeProfile()`*** on `UserRegistry` is used to change the user profile.
```solidity
function changeProfile(string calldata url) external;
```
- ***url*** - the **IPFS** URL to the new profile settings

#
Function ***`agreeToPrivacyPolicy()`*** on `UserRegistry` is used to agree to the privacy policy of the **DEXE** platform.
```solidity
function agreeToPrivacyPolicy(bytes calldata signature) external;
```
- ***signature*** - the **VRS** packed parameters of the **ECDSA** signature
