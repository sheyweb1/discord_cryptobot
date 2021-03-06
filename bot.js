
const Discord = require("discord.js");
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const fs = require("fs");
const path = require("path");
const spawnSync = require("child_process").spawnSync;

const config_json_file = path.dirname(process.argv[1]) + "/config.json"; 
var conf = get_config();
var client = new Discord.Client();


/* TODO
    - Add a way to run on background on win32 systems
*/


class ExchangeData {
    constructor(name) {
        this.defaults(name);
    }
    defaults(name) {
        this.name = name;
        this.link = "";
        this.price = "Error";
        this.volume = "Error";
        this.buy = "Error";
        this.sell = "Error";
        this.change = "Error";
    }
    fillj(json, price, volume, buy, sell, change) {
        this.fill(json[price], json[volume], json[buy], json[sell], json[change]);
    }
    fill(price, volume, buy, sell, change) {
        if (price === undefined && volume === undefined && buy === undefined && sell === undefined && change === undefined)
            return;
        this.price  = isNaN(price)  ? undefined : parseFloat(price).toFixed(8);
        this.volume = isNaN(volume) ? undefined : parseFloat(volume).toFixed(8);
        this.buy    = isNaN(buy)    ? undefined : parseFloat(buy).toFixed(8);
        this.sell   = isNaN(sell)   ? undefined : parseFloat(sell).toFixed(8);
        this.change = isNaN(change) ? undefined : (change >= 0.0 ? "+" : "") + parseFloat(change).toFixed(2) + "%";
    }
}

function get_ticker(exchange) {

    return new Promise((resolve, reject) => {

        const rg_replace = (str, lowercase = false) => {
            return str.replace("{COIN}", lowercase ? conf.coin.toLowerCase() : conf.coin.toUpperCase());
        };
        const js_request = (url, fn, lowercase = false) => { 
            let req = new XMLHttpRequest();
            req.open("GET", rg_replace(url, lowercase));
            req.onreadystatechange = () => {
                if (req.readyState === 4) {
                    if (req.status === 200) {
                        try {
                            fn(JSON.parse(req.responseText));
                        }
                        catch (e) {
                            //
                        }
                    }
                    resolve(exdata);
                }
            };
            req.send();
        };

        var exdata = new ExchangeData(exchange);
        var tmp;

        switch (exchange.toLowerCase()) {
            case "cryptobridge": {
                exdata.link = rg_replace("https://wallet.crypto-bridge.org/market/BRIDGE.{COIN}_BRIDGE.BTC");
                js_request("https://api.crypto-bridge.org/api/v1/ticker/{COIN}_BTC", res => exdata.fillj(res, "last", "volume", "bid", "ask", "percentChange"));
                break;
            }
            case "crex24": {
                exdata.link = rg_replace("https://crex24.com/exchange/{COIN}-BTC");
                js_request("https://api.crex24.com/v2/public/tickers?instrument={COIN}-BTC", res => exdata.fillj(res[0], "last", "volumeInBtc", "bid", "ask", "percentChange"));
                break;
            }
            case "coinexchange": {
                exdata.link = rg_replace("https://www.coinexchange.io/market/{COIN}/BTC");
                js_request("https://www.coinexchange.io/api/v1/getmarketsummary?market_id=" + conf.special_ticker.CoinExchange, res => exdata.fillj(res["result"], "LastPrice", "BTCVolume", "BidPrice", "AskPrice", "Change"));
                break;
            }
            case "graviex": {
                exdata.link = rg_replace("https://graviex.net/markets/{COIN}btc", true);
                js_request("https://graviex.net:443//api/v2/tickers/{COIN}btc.json", res => exdata.fillj(res["ticker"], "last", "volbtc", "buy", "sell", "change"), true);
                break;
            }
            case "escodex": {
                exdata.link = rg_replace("https://wallet.escodex.com/market/ESCODEX.{COIN}_ESCODEX.BTC");
                js_request("http://labs.escodex.com/api/ticker", res => exdata.fillj(res.find(x => x.base === "BTC" && x.quote === conf.coin.toUpperCase()), "latest", "base_volume", "lowest_ask", "highest_bid", "percent_change"));
                break;
            }
            case "cryptopia": {
                exdata.link = rg_replace("https://www.cryptopia.co.nz/Exchange/?market={COIN}_BTC");
                js_request("https://www.cryptopia.co.nz/api/GetMarket/{COIN}_BTC", res => exdata.fillj(res["Data"], "LastPrice", "BaseVolume", "AskPrice", "BidPrice", "Change"));
                break;
            }
            case "stex": {
                exdata.link = rg_replace("https://app.stex.com/en/basic-trade/BTC?currency2={COIN}");
                js_request("https://app.stex.com/api2/ticker", res => {
                    tmp = res.find(x => x.market_name === rg_replace("{COIN}_BTC"));
                    exdata.fill(tmp["last"], (tmp["last"] + tmp["lastDayAgo"]) / 2 * tmp["volume"], tmp["ask"], tmp["bid"], tmp["last"] / tmp["lastDayAgo"]); // volume and change not 100% accurate
                });
                break;
            }
            case "c-cex": {
                exdata.link = rg_replace("https://c-cex.com/?p={COIN}-btc", true);
                js_request("https://c-cex.com/t/{COIN}-btc.json", res => {
                    tmp = res["ticker"];
                    let vol = undefined;
                    try {
                        let req = new XMLHttpRequest();
                        req.open("GET", "https://c-cex.com/t/volume_btc.json", false);
                        req.send();
                        vol = JSON.parse(req.responseText)["ticker"][conf.coin.toLowerCase()]["vol"];
                    }
                    catch(e) {
                        //
                    }
                    exdata.fill(tmp["lastprice"], vol, tmp["buy"], tmp["sell"], undefined); // change not supported
                }, true);
                break;
            }
            case "hitbtc": {
                exdata.link = rg_replace("https://hitbtc.com/{COIN}-to-BTC");
                js_request("https://api.hitbtc.com/api/2/public/ticker/{COIN}BTC", res => exdata.fillj(res, "last", "volumeQuote", "ask", "bid", "")); // change not supported
                break;
            }
            case "yobit": {
                exdata.link = rg_replace("https://yobit.net/en/trade/{COIN}/BTC");
                js_request("https://yobit.net/api/2/{COIN}_btc/ticker", res => exdata.fillj(res["ticker"], "last", "vol", "buy", "sell", ""), true); // change not supported
                break;
            }
            case "bittrex": {
                exdata.link = rg_replace("https://www.bittrex.com/Market/Index?MarketName=BTC-{COIN}");
                js_request("https://bittrex.com/api/v1.1/public/getmarketsummary?market=btc-{COIN}", res => {
                    tmp = res["result"][0];
                    exdata.fill(tmp["Last"], tmp["BaseVolume"], tmp["Bid"], tmp["Ask"], tmp["Last"] / tmp["PrevDay"]); // change not 100% accurate
                }, true);
                
                break;
            }
            case "southxchange": {
                exdata.link = rg_replace("https://www.southxchange.com/Market/Book/{COIN}/BTC");
                js_request("https://www.southxchange.com/api/price/{COIN}/BTC", res => exdata.fillj(res, "Last", "Volume24Hr", "Bid", "Ask", "Variation24Hr"));
                break;
            }
            case "exrates": {
                exdata.link = "https://exrates.me/dashboard"; // no filter
                js_request("https://exrates.me/openapi/v1/public/ticker?currency_pair={COIN}_btc", res => exdata.fillj(res[0], "last", "quoteVolume", "highestBid", "lowestAsk", "percentChange"), true);
                break;
            }
            case "binance": {
                exdata.link = rg_replace("https://www.binance.com/es/trade/{COIN}_BTC");
                js_request("https://api.binance.com/api/v1/ticker/24hr?symbol={COIN}BTC", res => exdata.fillj(res, "lastPrice", "quoteVolume", "bidPrice", "askPrice", "priceChangePercent"));
                break;
            }
            case "bitfinex": {
                exdata.link = rg_replace("https://www.bitfinex.com/t/{COIN}:BTC");
                // [bid, bidsize, ask, asksize, daychg, daychg%, last, vol, high, low]
                js_request("https://api.bitfinex.com/v2/ticker/t{COIN}BTC", res => exdata.fill(res[6], (res[8] + res[9]) / 2 * res[7], res[0], res[2], res[5])); // volume not 100% accurate
                break;
            }
            case "moondex": {
                exdata.link = rg_replace("https://beta.moondex.io/market/MOONDEX.{COIN}_MOONDEX.BTC");
                js_request("https://data.moondex.io/ticker/{COIN}_BTC", res => exdata.fillj(res, "latest", "volume", "highestBid", "lowestAsk", "percentChange"));
                break;
            }
            case "coinex": {
                exdata.link = rg_replace("https://www.coinex.com/exchange?currency=btc&dest={COIN}#limit", true);
                js_request("https://api.coinex.com/v1/market/ticker?market={COIN}BTC", res => {
                    tmp = res["data"]["ticker"];
                    exdata.fill(tmp["last"], (parseFloat(tmp["high"]) + parseFloat(tmp["low"])) / 2 * tmp["vol"], tmp["buy"], tmp["sell"], tmp["last"] / tmp["open"]); // volume not 100% accurate
                });
                break;
            }
            case "p2pb2b": {
                exdata.link = rg_replace("https://p2pb2b.io/trade/{COIN}_BTC");
                js_request("https://p2pb2b.io/api/v1/public/ticker?market={COIN}_BTC", res => exdata.fillj(res["result"], "last", "deal", "bid", "ask", "change"));
                break;
            }
            case "coinsbit": {
                exdata.link = rg_replace("https://coinsbit.io/trade/{COIN}_BTC");
                js_request("https://coinsbit.io/api/v1/public/ticker?market={COIN}_BTC", res => exdata.fillj(res["result"], "last", "deal", "bid", "ask", "change"));
                break;
            }
            default: {
                resolve(exdata);
            }
        }
        
    });

}
function price_avg() {

    return new Promise((resolve, reject) => {
        let promises = [];
        for (let ticker of conf.ticker)
            promises.push(get_ticker(ticker));
        Promise.all(promises).then(values => {
            let sum = 0.00, len = 0;
            for (x of values) {
                if (x.price !== "Error") {
                    sum += parseFloat(x.price);
                    len++;
                }
            }
            resolve(sum / len);
        });
    });
}
function price_btc_usd() {

    return new Promise((resolve, reject) => {
        let req = new XMLHttpRequest();
        req.open("GET", "https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD");
        req.onreadystatechange = () => {
            if (req.readyState === 4) {
                if (req.status === 200) {
                    try {
                        resolve(JSON.parse(req.responseText)["USD"]);
                    }
                    catch (e) {
                        //
                    }
                }
                resolve(0);
            }
        };
        req.send();
    });

}
function earn_fields(coinday, avgbtc, priceusd) {
    const earn_value = (mult) => {
        return (coinday * mult).toFixed(4) + " " + conf.coin +
            (conf.earnsbtc ? "\n" + (coinday * mult * avgbtc).toFixed(8) + " BTC" : "") +
            (conf.earnsusd ? "\n" + (coinday * mult * avgbtc * priceusd).toFixed(2) + " USD" : "");
    };
    return [
        {
            name: "Daily",
            value: earn_value(1),
            inline: true
        },
        {
            name: "Weekly",
            value: earn_value(7),
            inline: true
        },
        {
            name: "Monthly",
            value: earn_value(30),
            inline: true
        },
        {
            name: "Yearly",
            value: earn_value(365),
            inline: true
        }
    ];
}
function get_config() {
    var str = fs.readFileSync(config_json_file, "utf8"); // for some reason is adding a invalid character at the beginning that causes a throw
    var json = JSON.parse(str.slice(str.indexOf("{")));
    json.cmd = {
        stats: {
            stats: json.requests.blockcount !== "" || json.requests.mncount !== "" || json.requests.supply !== "",
            blockcount: json.requests.blockcount !== "",
            mncount: json.requests.mncount !== "",
            supply: json.requests.supply !== "",
            collateral: json.requests.blockcount !== "",
            mnreward: json.requests.blockcount !== "",
            powreward: json.requests.blockcount !== "",
            posreward: json.requests.blockcount !== "",
            locked: json.requests.blockcount !== "" && json.requests.mncount !== "" && json.requests.supply !== "",
            avgmnreward: json.requests.mncount !== "",
            nextstage: json.requests.blockcount !== ""
        },
        earnings: json.requests.blockcount !== "" && json.requests.mncount !== "",
        balance: json.requests.balance !== "",
        blockindex: json.requests.blockhash !== "" && json.requests.blockindex !== "",
        blockhash: json.requests.blockhash !== "",
        mining: json.requests.hashrate !== ""
    };
    return json;
}
function get_stage(blk) {
    for (let stage of conf.stages)
        if (blk <= stage.block)
            return stage;
    return conf.stages[conf.stages.length - 1];
}
function synced_request(url) {
    var req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send();
    return req.responseText;
}
function bash_cmd(cmd) {
    return (process.platform === "win32" ? spawnSync("cmd.exe", ["/S", "/C", cmd]) : spawnSync("sh", ["-c", cmd])).stdout.toString();
}
function restart_bot() {
    for (let i = 5; i > 0; i--) {
        console.log("Restarting bot in " + i + " seconds..."); // just to avoid constant reset in case of constant crash cause no internet
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
    client.destroy().then(() => {
        client = new Discord.Client();
        client.on("message", response_msg);
        client.login(conf.token).then(() => console.log("Bot restart succeeded!"));
    });
}

class BotCommand {

    constructor(msg) {
        this.msg = msg;
    }

    price() {

        let promises = [];
        for (let ticker of conf.ticker)
            promises.push(get_ticker(ticker));

        Promise.all(promises).then(values => {

            const hide_undef = (str, val) => {
                if (val === undefined)
                    return conf.hidenotsupported ? "\n" : str + "Not Supported" + "\n";
                return str + val + "\n";
            };

            let embed = new Discord.RichEmbed();
            embed.title = "**Price Ticker**";
            embed.color = conf.color.prices;
            embed.timestamp = new Date();

            for (let data of values) {
                embed.addField(
                    data.name,
                    hide_undef("**| Price** : ", data.price) +
                    hide_undef("**| Vol** : ", data.volume) +
                    hide_undef("**| Buy** : ", data.buy) +
                    hide_undef("**| Sell** : ", data.sell) +
                    hide_undef("**| Chg** : ", data.change) +
                    "[Link](" + data.link + ")",
                    true
                );
            }
            if (embed.fields.length % 3 === 2) // fix bad placing if a row have 2 tickers
                embed.addBlankField(true);

            this.msg.channel.send(embed);
        });

    }

    stats() {

        Promise.all([
            new Promise((resolve, reject) => resolve(bash_cmd(conf.requests.blockcount))),
            new Promise((resolve, reject) => resolve(bash_cmd(conf.requests.mncount))),
            new Promise((resolve, reject) => resolve(bash_cmd(conf.requests.supply)))
        ]).then(([blockcount, mncount, supply]) => {

            var stage = get_stage(blockcount);
            var stg_index = conf.stages.indexOf(stage);

            var embed = new Discord.RichEmbed();
            embed.title = conf.coin + " Stats";
            embed.color = conf.color.coininfo;
            embed.timestamp = new Date();

            for (let stat of conf.statorder) {
                switch (stat) {
                    case "blockcount": { // requires: blockcount
                        if (conf.cmd.stats.blockcount)
                            embed.addField("Block Count", blockcount, true);
                        break;
                    }
                    case "mncount": { // requires: mncount
                        if (conf.cmd.stats.mncount)
                            embed.addField("MN Count", mncount, true);
                        break;
                    }
                    case "supply": { // requires: supply
                        if (conf.cmd.stats.supply)
                            embed.addField("Supply", parseFloat(supply).toFixed(4).replace(/(\d)(?=(?:\d{3})+(?:\.|$))|(\.\d{4}?)\d*$/g, (m, s1, s2) => s2 || s1 + ',') + " " + conf.coin, true);
                        break;
                    }
                    case "collateral": { // requires: blockcount
                        if (conf.cmd.stats.collateral)
                            embed.addField("Collateral", stage.coll + " " + conf.coin, true);
                        break;
                    }
                    case "mnreward": { // requires: blockcount
                        if (conf.cmd.stats.mnreward)
                            embed.addField("MN Reward", stage.mn + " " + conf.coin, true);
                        break;
                    }
                    case "powreward": { // requires: blockcount
                        if (stage.pow !== undefined && conf.cmd.stats.powreward)
                            embed.addField("POW Reward", stage.pow + " " + conf.coin, true);
                        break;
                    }
                    case "posreward": { // requires: blockcount
                        if (stage.pos !== undefined && conf.cmd.stats.posreward)
                            embed.addField("POS Reward", stage.pos + " " + conf.coin, true);
                        break;
                    }
                    case "locked": { // requires: blockcount, mncount, supply
                        if (conf.cmd.stats.locked)
                            embed.addField("Locked", (mncount * stage.coll).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " " + conf.coin + " (" + (mncount * stage.coll / supply * 100).toFixed(2) + "%)", true);
                        break;
                    }
                    case "avgmnreward": { // requires: mncount
                        if (conf.cmd.stats.avgmnreward)
                            embed.addField("Avg. MN Reward", parseInt(mncount / (86400 / conf.blocktime)) + "d " + parseInt(mncount / (3600 / conf.blocktime) % 24) + "h " + parseInt(mncount / (60 / conf.blocktime) % 60) + "m", true);
                        break;
                    }
                    case "nextstage": { // requires: blockcount
                        if (conf.cmd.stats.nextstage)
                            embed.addField("Next Stage", parseInt((conf.stages[stg_index].block - blockcount) / (86400 / conf.blocktime)) + "d " + parseInt((conf.stages[stg_index].block - blockcount) / (3600 / conf.blocktime) % 24) + "h " + parseInt((conf.stages[stg_index].block - blockcount) / (60 / conf.blocktime) % 60) + "m", true);
                        break;
                    }
                    case "": {
                        embed.addBlankField(true);
                        break;
                    }
                }
            }

            this.msg.channel.send(embed);

        });

    }
    earnings() {

        Promise.all([
            new Promise((resolve, reject) => resolve(bash_cmd(conf.requests.blockcount))),
            new Promise((resolve, reject) => resolve(bash_cmd(conf.requests.mncount))),
            new Promise((resolve, reject) => resolve(conf.earnsbtc || conf.earnsusd ? price_avg() : 0)),
            new Promise((resolve, reject) => resolve(conf.earnsusd ? price_btc_usd() : 0))
        ]).then(([blockcount, mncount, avgbtc, priceusd]) => {
            let stage = get_stage(blockcount);
            let coinday = 86400 / conf.blocktime / mncount * stage.mn;
            this.msg.channel.send({
                embed: {
                    title: conf.coin + " Earnings",
                    color: conf.color.coininfo,
                    fields: [
                        {
                            name: "ROI",
                            value: (36500 / (stage.coll / coinday)).toFixed(2) + "% / " + (stage.coll / coinday).toFixed(2) + " days"
                        }
                    ].concat(earn_fields(coinday, avgbtc, priceusd)),
                    timestamp: new Date()
                }
            });
        });

    }
    mining(hr, mult) {

        let letter = "";

        const calc_multiplier = () => {
            if (mult !== undefined)
                switch (mult.toUpperCase()) {
                    case "K": case "KH": case "KHS": case "KH/S": case "KHASH": case "KHASHS": case "KHASH/S":
                        letter = "K";
                        return hr * 1000;
                    case "M": case "MH": case "MHS": case "MH/S": case "MHASH": case "MHASHS": case "MHASH/S":
                        letter = "M";
                        return hr * 1000 * 1000;
                    case "G": case "GH": case "GHS": case "GH/S": case "GHASH": case "GHASHS": case "GHASH/S":
                        letter = "G";
                        return hr * 1000 * 1000 * 1000;
                    case "T": case "TH": case "THS": case "TH/S": case "THASH": case "THASHS": case "THASH/S":
                        letter = "T";
                        return hr * 1000 * 1000 * 1000 * 1000;
                }
            return hr;
        };

        if (/^[0-9.\n]+$/.test(hr)) {
            Promise.all([
                new Promise((resolve, reject) => resolve(bash_cmd(conf.requests.blockcount))),
                new Promise((resolve, reject) => resolve(bash_cmd(conf.requests.hashrate))),
                new Promise((resolve, reject) => resolve(conf.earnsbtc || conf.earnsusd ? price_avg() : 0)),
                new Promise((resolve, reject) => resolve(conf.earnsusd ? price_btc_usd() : 0))
            ]).then(([blockcount, total_hr, avgbtc, priceusd]) => {
                let stage = get_stage(blockcount);
                let coinday = 86400 / conf.blocktime * stage.pow * calc_multiplier() / total_hr;
                this.msg.channel.send({
                    embed: {
                        title: conf.coin + " Mining (" + hr + " " + letter + "H/s)",
                        color: conf.color.coininfo,
                        description: stage.pow === undefined ? "POW disabled in the current coin stage" : "",
                        fields: stage.pow === undefined ? [] : earn_fields(coinday, avgbtc, priceusd),
                        timestamp: new Date()
                    }
                });
            });
        }
        else {
            this.msg.channel.send({
                embed: {
                    title: conf.coin + " Mining ( ? H/s)",
                    color: conf.color.coininfo,
                    description: "Invalid hashrate"
                }
            });
        }
        
    }

    balance(addr) {

        try {
            let json = JSON.parse(bash_cmd(conf.requests.balance + addr));
            if (json["sent"] !== undefined || json["received"] !== undefined || json["balance"] !== undefined) {
                msg.channel.send({
                    embed: {
                        title: "Balance",
                        color: conf.color.explorer,
                        fields: [
                            {
                                name: "Address",
                                value: addr
                            },
                            {
                                name: "Sent",
                                value: json["sent"] + " " + conf.coin,
                                inline: true
                            },
                            {
                                name: "Received",
                                value: json["received"] + " " + conf.coin,
                                inline: true
                            },
                            {
                                name: "Balance",
                                value: json["balance"] + " " + conf.coin,
                                inline: true
                            }
                        ],
                        timestamp: new Date()
                    }
                });
            }
        }
        catch (e) {
            //
        }
        this.msg.channel.send({
            embed: {
                title: "Balance",
                color: conf.color.explorer,
                description: "Invalid address: " + cmds[1],
                timestamp: new Date()
            }
        });

    }
    block_index(index) {
        this.block_hash(bash_cmd(conf.requests.blockindex + index));
    }
    block_hash(hash) {

        let str = "Invalid block index or hash";

        if (/^[A-Za-z0-9\n]+$/.test(hash)) {
            try {
                var json = JSON.parse(bash_cmd(conf.requests.blockhash + hash));
                str =
                    "**Index:** " + json["height"] + "\n" +
                    "**Hash:** " + json["hash"] + "\n" +
                    "**Confirmations:** " + json["confirmations"] + "\n" +
                    "**Size:** " + json["size"] + "\n" +
                    "**Date:** " + new Date(new Number(json["time"]) * 1000).toUTCString() + "\n" +
                    "**Prev Hash:** " + json["previousblockhash"] + "\n" +
                    "**Next Hash:** " + json["nextblockhash"] + "\n" +
                    "**Transactions:**\n";
                for (let i = 0; i < json["tx"].length; i++)
                    str += json["tx"][i] + "\n";
            }
            catch (e) {
                //
            }
        }
        this.msg.channel.send({
            embed: {
                title: "Block info",
                color: conf.color.explorer,
                description: str
            }
        });

    }

    help() {

        const blocked_cmd = (cmd, str) => {
            return !cmd ? "*blocked command*" : str;
        };
        this.msg.channel.send({
            embed: {
                title: "**Available commands**",
                color: conf.color.other,
                fields: [
                    {
                        name: "Exchanges:",
                        value:
                            " - **" + conf.prefix + "price" + "** : get the current price of " + conf.coin + " on every listed exchange"
                    },
                    {
                        name: "Coin Info:",
                        value:
                            " - **" + conf.prefix + "stats** : "    + blocked_cmd(conf.cmd.stats.stats, "get the current stats of the " + conf.coin + " blockchain") + "\n" +
                            " - **" + conf.prefix + "earnings** : " + blocked_cmd(conf.cmd.earnings,    "get the expected " + conf.coin + " earnings per masternode to get an idea of how close you are to getting a lambo") + "\n" +
                            " - **" + conf.prefix + "mining <hashrate> [K/M/G/T]** : " + blocked_cmd(conf.cmd.earnings, "get the expected " + conf.coin + " earnings with the given hashrate, aditionally you can put the hashrate multiplier (K = KHash/s, M = MHash/s, ...)")
                    },
                    {
                        name: "Explorer",
                        value:
                            " - **" + conf.prefix + "balance <address>** : "    + blocked_cmd(conf.cmd.balance,    "show the balance, sent and received of the given address") + "\n" +
                            " - **" + conf.prefix + "block-index <number>** : " + blocked_cmd(conf.cmd.blockindex, "show the info of the block by its index") + "\n" +
                            " - **" + conf.prefix + "block-hash <hash>** : "    + blocked_cmd(conf.cmd.blockhash,  "show the info of the block by its hash")
                    },
                    {
                        name: "Other:",
                        value:
                            " - **" + conf.prefix + "help** : the command that you just used\n" +
                            " - **" + conf.prefix + "about** : know more about me :smirk:"
                    },
                    {
                        name: "Admins only:",
                        value:
                            " - **" + conf.prefix + "conf-get** : retrieve the bot config via dm\n" +
                            " - **" + conf.prefix + "conf-set** : set a new config to the bot via dm"
                    }
                ]
            }
        });

    }
    about() {

        const donate = { // don't be evil with this, please
            "BCARD": "BQmTwK685ajop8CFY6bWVeM59rXgqZCTJb",
            "SNO": "SZ4pQpuqq11EG7dw6qjgqSs5tGq3iTw2uZ",
            "RESQ": "QXFszBEsRXWy2D2YFD39DUqpnBeMg64jqX"
        };
        this.msg.channel.send({
            embed: {
                title: "**About**",
                color: conf.color.other,
                description: "**Author:** <@464599914962485260>\n" +
                    "**Source Code:** [Link](" + conf.sourcecode + ")\n" + // source link on conf just in case I change the repo
                    "**Description:** A simple bot for " + conf.coin + " to check the current status of the currency in many ways, use **!help** to see these ways\n" +
                    (conf.coin in donate ? "**" + conf.coin + " Donations (to author):** " + donate[conf.coin] + "\n" : "") +
                    "**BTC Donations (to author):** 3HE1kwgHEWvxBa38NHuQbQQrhNZ9wxjhe7"
            }
        });

    }

    conf_get() {
        this.msg.channel.send("<@" + this.msg.author.id + "> check the dm I just sent to you :wink:");
        this.msg.author.send({ files: [config_json_file] });
    }
    conf_set() {
        this.msg.channel.send("<@" + this.msg.author.id + "> check the dm I just sent to you :wink:");
        this.msg.author.send("Put the config.json file here and I'll update myself with the changes, don't send any message, just drag and drop the file, you have 90 seconds to put the file or you'll have to use **!conf-set** again").then(reply => {
            let msgcol = new Discord.MessageCollector(reply.channel, m => m.author.id === this.msg.author.id, { time: 90000 });
            msgcol.on("collect", (elem, col) => {
                msgcol.stop("received");
                if (elem.attachments.array()[0]["filename"] !== "config.json") {
                    this.msg.author.send("I requested a file called 'config.json', not whatever is this :expressionless: ");
                    return;
                }
                try {
                    let conf_res = synced_request(elem.attachments.array()[0]["url"]);
                    conf_res = conf_res.slice(conf_res.indexOf("{"));
                    JSON.parse(conf_res); // just check if throws
                    fs.writeFileSync(config_json_file, conf_res);
                    conf = get_config();
                    this.msg.channel.send("Config updated by <@" + this.msg.author.id + ">, if something goes wrong, it will be his fault :stuck_out_tongue: ");
                }
                catch (e) {
                    this.msg.author.send("Something seems wrong on the json file you sent, check that everything is okay and use **!conf-set** again");
                }
            });
            msgcol.on("end", (col, reason) => {
                if (reason === "time")
                    this.msg.author.send("Timeout, any file posted from now ill be ignored unless **!conf-set** is used again");
            });
        });
    }

}

function response_msg(msg) {

    if (msg.channel.id !== conf.channel || !msg.content.startsWith(conf.prefix) || msg.author.bot)
        return;

    var args = msg.content.slice(conf.prefix.length).split(" ");
    var cmd = new BotCommand(msg);

    const error_noparam = (n, descr) => {
        if (args.length >= n)
            return false;
        msg.channel.send({
            embed: {
                title: "Missing Parameter",
                color: conf.color.error,
                description: descr
            }
        });
        return true;
    };
    const error_noworthy = () => {
        if (conf.devs.indexOf(msg.author.id) > -1)
            return false;
        msg.channel.send({
            embed: {
                title: "Admin command",
                color: conf.color.error,
                description: "<@" + msg.author.id + "> you're not worthy to use this command"
            }
        });
        return true;
    };

    switch (args[0]) {

        // Exchanges: 

        case "price": {
            cmd.price();
            break;
        }

        // Coin Info:

        case "stats": {
            if (conf.cmd.stats.stats)
                cmd.stats();
            break;
        }
        case "earnings": { 
            if (conf.cmd.earnings)
                cmd.earnings();
            break;
        }
        case "mining": { 
            if (conf.cmd.mining && !error_noparam(2, "You need to provide amount of hashrate"))
                cmd.mining(args[1], args[2]);
            break;
        }

        // Explorer:

        case "balance": {
            if (conf.cmd.balance && !error_noparam(2, "You need to provide an address"))
                cmd.balance(args[1]);
            break;
        }
        case "block-index": {
            if (conf.cmd.blockindex && !error_noparam(2, "You need to provide a block number"))
                cmd.block_index(args[1]);
            break;
        }
        case "block-hash": {
            if (conf.cmd.blockhash && !error_noparam(2, "You need to provide a block hash"))
                cmd.block_hash(args[1]);
            break;
        }

        // Other:

        case "help": {
            cmd.help();
            break;
        }
        case "about": { 
            cmd.about();
            break;
        }
        case "meaning-of-life": { // easter egg
            msg.channel.send({
                embed: {
                    title: "Answer to life, the universe and everything",
                    color: conf.color.other,
                    description: "42"
                }
            });
            break;
        }
        case "price-go-to-the-moon": { // easter egg
            msg.channel.send({
                embed: {
                    title: "**Price Ticker**",
                    color: conf.color.prices,
                    description: "**All Exchanges: ** One jillion satoshis"
                }
            });
            break;
        }

        // Admin only:

        case "conf-get": {
            if (!error_noworthy())
                cmd.conf_get();
            break;
        }
        case "conf-set": {
            if (!error_noworthy())
                cmd.conf_set();
            break;
        }
        
    }

}


function run_background() {

    if (process.argv.length < 3 || process.argv[2] !== "background")
        return;

    if (process.platform === "linux") {
        let service = "[Unit]\n" +
            "Description=discord_cryptobot service\n" +
            "After=network.target\n" +
            "\n" +
            "[Service]\n" +
            "User=root\n" +
            "Group=root\n" +
            "ExecStart=" + process.argv[0] + " " + process.argv[1] + "\n" +
            "Restart=always\n" +
            "\n" +
            "[Install]\n" +
            "WantedBy=multi-user.target";

        fs.writeFileSync("/etc/systemd/system/discord_cryptobot.service", service);
        bash_cmd("chmod +x /env/systemd/system/discord_cryptobot.service");
        bash_cmd("systemctl daemon-reload");
        bash_cmd("systemctl start discord_cryptobot.service");
        bash_cmd("systemctl enable discord_cryptobot.service");

        console.log("Start:              \x1b[1;32msystemctl start   discord_cryptobot.service\x1b[0m");
        console.log("Stop:               \x1b[1;32msystemctl stop    discord_cryptobot.service\x1b[0m");
        console.log("Start on reboot:    \x1b[1;32msystemctl enable  discord_cryptobot.service\x1b[0m");
        console.log("No start on reboot: \x1b[1;32msystemctl disable discord_cryptobot.service\x1b[0m");
        console.log("Status:             \x1b[1;32msystemctl status  discord_cryptobot.service\x1b[0m");

        console.log("Current status: Running and Start on reboot");
    }
    else {
        console.log("Can't run on background in non-linux systems");
    }
    process.exit();
}
run_background();


process.on("uncaughtException", err => {
    console.log("Global exception caught: " + err);
    restart_bot();
});
process.on("unhandledRejection", err => {
    console.log("Global rejection handled: " + err);
    restart_bot();
});

client.on("message", response_msg);
client.login(conf.token).then(() => console.log("Bot ready!"));

