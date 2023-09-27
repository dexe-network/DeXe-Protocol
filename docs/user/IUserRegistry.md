# IUserRegistry

## Interface Description


License: MIT

## 

```solidity
interface IUserRegistry
```

This is the contract that stores user profile settings + his privacy policy agreement EIP712 signature
## Structs info

### UserInfo

```solidity
struct UserInfo {
	string profileURL;
	bytes32 signatureHash;
}
```

The structure that stores info about the user


Parameters:

| Name          | Type    | Description                                |
| :------------ | :------ | :----------------------------------------- |
| profileURL    | string  | is an IPFS URL to the user's profile data  |
| signatureHash | bytes32 | is a hash of a privacy policy signature    |

## Functions info

### changeProfile (0x482b390f)

```solidity
function changeProfile(string calldata url) external
```

The function to change the user profile


Parameters:

| Name | Type   | Description                              |
| :--- | :----- | :--------------------------------------- |
| url  | string | the IPFS URL to the new profile settings |

### agreeToPrivacyPolicy (0xd9ee212a)

```solidity
function agreeToPrivacyPolicy(bytes calldata signature) external
```

The function to agree to the privacy policy of the DEXE platform.
The user has to sign the hash of the privacy policy document


Parameters:

| Name      | Type  | Description                                      |
| :-------- | :---- | :----------------------------------------------- |
| signature | bytes | the VRS packed parameters of the ECDSA signature |

### changeProfileAndAgreeToPrivacyPolicy (0x2cb83257)

```solidity
function changeProfileAndAgreeToPrivacyPolicy(
    string calldata url,
    bytes calldata signature
) external
```

The function to change the profile and sign the privacy policy in a single transaction


Parameters:

| Name      | Type   | Description                                      |
| :-------- | :----- | :----------------------------------------------- |
| url       | string | the IPFS URL to the new profile settings         |
| signature | bytes  | the VRS packed parameters of the ECDSA signature |

### agreed (0xa5b8f210)

```solidity
function agreed(address user) external view returns (bool)
```

The function to check whether the user signed the privacy policy


Parameters:

| Name | Type    | Description        |
| :--- | :------ | :----------------- |
| user | address | the user to check  |


Return values:

| Name | Type | Description                                                    |
| :--- | :--- | :------------------------------------------------------------- |
| [0]  | bool | true is the user has signed to privacy policy, false otherwise |

### setPrivacyPolicyDocumentHash (0xc1bbeefe)

```solidity
function setPrivacyPolicyDocumentHash(bytes32 hash) external
```

The function to set the hash of the document the user has to sign


Parameters:

| Name | Type    | Description                                  |
| :--- | :------ | :------------------------------------------- |
| hash | bytes32 | the has of the document the user has to sign |
