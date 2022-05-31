# Solana examples

we're expecting you have both rust and solana cli installed

To run baremetal examples

    npm i
    npm run build

that commands builds binary files for each of the examples and creates target/ directory within examples_baremtal/

## Solana connection

### Local cluster

set your config to localhost

    solana config set --url localhost

then run in seperate window

    npm run start-local-cluster

which will spin up local solana cluster for you with RPC enpoint defaulted to localhost:8899
npm run script 'start-local-cluster' is invoking

    solana-test-validator --reset

you can monitor the logs in seperate window by running

    solana logs

### Devnet

if you want to use devnet run

    solana config set --url https://api.devnet.solana.com

## Commands for each example

for each example run the following commands

    npm run deploy:n

where n is example number from 1 to 7
what this script does in the background

    solana program deploy ./examples_baremetal/target/deploy/nameOfExampleProgram.so"

the program would be deployed to the network specified in solana config

in order to interact with the contract, we'll be running the typescript code located in client/ within each example

command to run

    npm run call:n

where n is example number from 1 to 8
