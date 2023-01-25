# 📝 Litepaper

![Logo](./img/logoDeXe.svg)

## Abstract

**DeXe** is a decentralized social trading platform design to copy the best trader strategies. You can create your personalized trading token, invest into other traders to multiply your assets by purchasing their tokens (each token is baked by real assets and its price depends on the trader's skills), repeat other wallets trading transactions using *Wallet-to-Wallet* copying.

On **DeXe** platform user can also form a **DAO** for collective decision-making and execution of those decisions. 
**DAO** pools can be useful for projects that want to give their community a vote in the development of the project or to control the treasuries.

**DeXe** aims to be a community owned decentralized finance system.


## DeXe protocol overview

**DeXe** protocol is a multichain protocol that enables: 

- ***Decentralized Autonomous Organizations***: **DAO** pools with their own tokens are used for collective governance
- ***Validators***: validators in the **DAO** pool may be needed in order to validate incoming proposals after they have been approved by the community
- ***TokenSale***: sale of a **DAO** pool token with custom settings (whitelists of users and exchange tokens, sales tiers, vesting, etc)
- ***Staking***: if the user does not want to vote for proposals on his own, he can delegate part of his funds to another user and receive rewards
- ***Trading***: user can earn by trading tokens on the platform, receive investments for your trading from other users
- ***Investing***: on **DeXe** platform, user can invest own tokens into other traders 
- ***Insurance***: investor can buy an insurance to be protected from fraud
- ***Protocol Fees***: **DeXe** will charge fees in native token from trading operations to ensure protocol sustainability


**DeXe** protocol uses `The Graph` protocol for indexing and storing historical and statistical data.


## Current Smart Contracts


### DAO

This smart contracts implement the logic for making and executing a collective decision.

Types of **DAO** Pools (by pool token):
- with **ERC20** token
- with **ERC721** token
- with both (**ERC20** & **ERC721**)

These tokens are the means of determining whether a user belongs to the **DAO** community.

By owning pool tokens, the user gets the opportunity to vote and participate in the collective decision-making process. Also, a user with tokens can offer ideas that other members of the **DAO** pool can accept or reject.

**DAO** pool base contracts:

- ***GovPool***

This contract is responsible for the project's treasurer, for creating proposals, for voting and executing proposals. *GovPool* is also responsible for the rewards that are given to users for active participation in the life of the **DAO** pool.

- ***GovUserKeeper***

Contract is responsible for user funds that are used to vote for proposals, for the logic of deposit, withdrawal and delegation. 

- ***GovSettings***

*GovSettings* is responsible for **DAO** settings register (voting duration, quorum, reward token, etc)

- ***GovValidators***

Contract is responsible for the **DAO** pool validators. Validators are privileged members of the **DAO** pool that can veto (decline) proposals from the pool community through their internal voting.

Proposal contracts of **DAO** pools: 

- ***TokanSaleProposal***

Contract is responsible for selling **DAO** pool tokens with customized logic (tiers, user whitelist, exchange tokens whitelist and exchange rate, token supply for each tier, vesting logic, etc).

- ***DistributionProposal***

This is the contract the governance can execute in order to distribute rewards proportionally among all the voters who participated in the certain proposal.

#

#### ContractsRegistry

The contract is responsible for the *CRUD* functionality of other contracts in the protocol.

#### CoreProperties

The purpose of this contract is to store system constant parameters.

#### Insurance

An insurance is needed to secure users' assets invested in pools. Any user can buy insurance for any amount in **DeXe** tokens and get ***10x*** insurance. An investor who has bought insurance can open an insured event and provide information indicating a loss of funds.

#### PriceFeed

Contract is used for finding the best path for token exchange on **DEXes**.

#### TraderPools

A trader can create his own pool (fund) by sending a transaction using the smart contract method. The pool can be public and private. In private pool, the trader enters the addresses in the whitelist that can invest in this fund, public is open for all investors.

There are **2** types of pool:
- *Standard*: trade using whitelisted tokens
- *Invest*: invest into offchain assets 

Pool has its native **ERC20** token with unique symbols and can have several managers.

Maximum number of open positions - **25**.

Maximum number of investors in the pool - **1000**.

#### UserRegistry

*UserRegistry* contract is used to manage user`s profile.


## Protocol Fees

Of all commission received on trading, **DeXe** charges its own commission of ***30%*** and use it to immediately purchase the **DEXE** token.
Commission distribution:
- ⅓ to the treasury of the protocol
- ⅓ to the insurance fund
- ⅓ to the NFT holders (in the form of extra rewards for the DAO activity) 

## Governance

**DeXe** protocol is governed by **DAO** community. Parameters of the protocol that can be modified through protocol governance:
- **DeXe** commission change
- Changing proportions of **DeXe** commission distribution
- Adding a token to the whitelist/blacklist
- Upgrading contracts
- Managing the limits on the number of users in pools
- Managing the maximum number of positions for traders
- Changing the parameters of the trader's leverage formula
- Adjusting insurance parameters
