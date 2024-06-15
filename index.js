const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const  Hyperbee = require ('hyperbee')
const { AUCTION_TOPIC_KEY, AUCTION_TOPIC_SECRET } = require("./constants");
const b4a  = require('b4a')
const { CLI } = require('./cli')


class Auction {
  constructor() {
    this.filename = (Math.random() + 1).toString(36).substring(7)
    this.corestore = new Corestore(this.filename, {writable: true})
    this.clients = []

    this.key = b4a.from(AUCTION_TOPIC_KEY, 'hex')

    this.core = this.corestore.get({key: this.key, keyPair: {publicKey: this.key, secretKey: b4a.from(AUCTION_TOPIC_SECRET, 'hex')}})

    this.bee = new Hyperbee(this.core, {
      keyEncoding: 'utf-8',
      valueEncoding: 'json'
    })
    this.swarm = new Hyperswarm()
    // this.topic = AUCTION_TOPIC
    this.joinSwarm()
    process.on('exit', function (){
     this.swarm.destroy()
    });
     // Pear.teardown(() => swarm.destroy())

    this.openAuction = this.openAuction.bind(this)
    this.makebid = this.makeBid.bind(this)
    this.closeAuction = this.closeAuction.bind(this)
    this.askOptions = this.askOptions.bind(this)
    this.showActiveAuction = this.showActiveAuction.bind(this)
    this.foundPeers = this.core.findingPeers()

     this.cli = new CLI();
  }



  async joinSwarm() {

    await this.core.ready()
    await this.bee.ready()
    this.foundPeers()
    const discovery = this.swarm.join(this.core.discoveryKey)
    discovery.flushed().then(async () => {
        console.log(`bee key: ${b4a.toString(this.core.key, 'hex')}`)

        console.log(`Hi, ${this.swarm.keyPair.publicKey.toString('hex')}, \nWelcome to the auction! \n`)

       await this.showActiveAuction()
       await this.askOptions()
    })

    this.swarm.on('connection', async (conn, peerInfo) => {
        this.corestore.replicate(conn)

        this.clients.push(conn)

        console.log(`Peer Joined! - ${peerInfo.publicKey.toString("hex")} \n`)


        /** showing active actions from the recently synced corestore */
        await this.showActiveAuction()
        await this.askOptions()

        conn.on("data", (data) => {
          try {
            const jsonData = JSON.parse(data.toString());

            if (jsonData.type === "update") {
              console.log(`${JSON.stringify(jsonData.message)} \n`);
            }
          }
          catch (Ex) {
            
          }
        })
  })
  }

  async showActiveAuction() {
    if (this.core.length === 0) {
      console.log('No Active Auctions\n')
    }
    else {
      console.log('Active Auctions List!\n')
      for await (const { key, value } of this.bee.createReadStream()) {
        console.log(`${JSON.stringify(value)} \n`)
      }
    }
  }

  async askOptions() {
    const publicKey = this.swarm.keyPair.publicKey.toString('hex')
    const option = await this.cli.askTerminal("Enter your option? \n 1. Start an auction. \n 2. Bid an active auction. \n 3. Close an auction. \n");
    let item = '' 
    switch (option) {
        case '1':
           item= await this.cli.askTerminal("Enter the item id to start the auction.")
           const startingBid = await this.cli.askTerminal("Enter the starting bid price.")
           await this.openAuction({item, startingBid, startedBy: publicKey})
           await this.askOptions()
          break
        case '2':
            item= await this.cli.askTerminal("Enter the item id to bid.")
            const bid = await this.cli.askTerminal("Enter the bid price.")
            try {
              await this.makeBid({item, bid, bidder: publicKey})
            }
            catch(ex) {
              console.log(`Error - ${ex} \n`)
            }
            await this.askOptions()
          break
        case '3':
            item = await this.cli.askTerminal("Enter the item id to close auction.")
            try {
              await this.closeAuction({item, closeBy: publicKey})
            }
            catch (ex) {
              console.log(`Error - ${ex} \n`)
            }
            await this.askOptions()
        default:
            console.log('Wrong options. Try Again! \n')
            await this.askOptions()
      }
  }

  async openAuction({ item, startingBid, startedBy}) {
    const auction = { item, highestBid: startingBid, winner: startedBy, startedBy}
    // console.log(this.bee.writable())
    await this.bee.put(item, auction)
    this.notifyAll('Auction Started', { ...auction })
    console.log(`Auction ${item} added`)
    return item
  }

  async makeBid({ item, bid, bidder}) {
    const auctionMap = await this.bee.get(item)
    if (!auctionMap) {
      throw new Error('Auction not found')
    }
    const auction = auctionMap.value
    if (Number(bid) <= Number(auction.highestBid)) {
      throw new Error('Bid too low')
    }
    auction.highestBid = bid
    auction.winner = bidder
    await this.bee.put(item, auction)
    this.notifyAll('New Bid made', { item, bid , bidder})
  }

  async closeAuction({item, closeBy}) {
    const auctionMap = await this.bee.get(item)
    if (!auctionNode) {
      throw new Error('Auction not found')
    }
    const auction = auctionMap.value
   
    if (auction.startedBy != closeBy) {
      throw new Error(`You cannot close this auction as it was started by ${auction.startedBy}`)
    }

    await this.bee.del(item)

    this.notifyAll('Auction Closed', { ...auction })
    return { auctionId, highestBid }
  }

  notifyAll(event, data) {
    for (const client of this.clients) {
      client.write(JSON.stringify({ type: 'update', event,  data }))
    }
    // this.swarm.connections.forEach((conn) => {
    //   conn.write(JSON.stringify({ type: 'update', event,  data }))
    // })
  }
}


new Auction()
