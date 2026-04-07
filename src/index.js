// import dotenv from "dotenv";
import {ArtifactsApi, ArtifactsError} from "artifacts-api-client";
import {coords} from "./constants.js";
import config from "../config.json" with { type: "json" };

// dotenv.config({
//     //path: "../.env"
// })

/**
 * @typedef {Object} LogMessage
 * @property {"info" | "error" | "warn" | "debug"} level
 * @property {string} msg
 * @property {string} [service]
 * @property {string} [worker]
 * @property {Object} [meta]
 */

/**
 * @param {LogMessage} log
 */
function logger(log) {
    if (!log.level || !log.msg) {
        throw new Error("Invalid log object")
    }

    const output = {
        timestamp: new Date().toISOString(),
        level: log.level,
        msg: log.msg,
        service: log.service || "bot",
        worker: log.worker || "test",
        meta: log.meta || {}
    }

    process.stdout.write(JSON.stringify(output) + "\n")
}

logger({
    level: "info",
    msg: "Starting bot... V0.0.3"
})

const api = ArtifactsApi.create({
    token: process.env.TOKEN
})

export function sleep(ms) {
    logger({
        level: "info",
        msg: "Waiting before next action",
        meta: {
            seconds: ms / 1000
        }
    })
    return new Promise(resolve => setTimeout(resolve, ms + 1000));
}


export function getInventoryCount(character) {
    const inv = character.inventory
    let count = 0;

    for (const item of inv) {
        count += item.quantity;
    }

    return {
        max: character.inventory_max_items,
        count
    }
}

export function getCoordsFromConfigItem() {
    const itemCode = config?.item;

    if (!itemCode) {
        throw new Error("config.json enthält keinen item-Wert.");
    }

    const coordKey = itemCode.trim().replaceAll("-", "_").toUpperCase();
    const itemCoords = coords[coordKey];

    if (!itemCoords) {
        throw new Error(`Keine Koordinaten für config.item="${itemCode}" gefunden.`);
    }

    return itemCoords;
}

export async function depositToBank(name, code, quantity) {
    const { data } = await api.myCharacters.move(name, coords.BANK)
    await sleep(data.cooldown.remaining_seconds * 1000)
    logger({
        level: "info",
        msg: "Depositing item to bank",
        meta: {
            name,
            code,
            quantity
        }
    })
    const res = await api.myCharacters.depositBankItem(name, [{
        code: code,
        quantity: quantity
    }])
    await sleep(res.data.cooldown.remaining_seconds * 1000)
    return getInventoryCount(res.data.character)
}

async function dumpItems(quantity) {
    await depositToBank(config.name, config.item, quantity)
    const { data} = await api.myCharacters.move(config.name, coords.GUDGEON)
    return await sleep(data.cooldown.remaining_seconds * 1000)
}

let running = true;

while (running) {
    try {
        const target_coords = getCoordsFromConfigItem();
        const char = await api.characters.get(config.name)
        if (char.data.x !==target_coords.x || char.data.y !== target_coords.y ) {
            await api.myCharacters.move(config.name, target_coords)
        }
        const res = await api.myCharacters.gathering(config.name);
        const character = res?.data?.character;
        const cooldownSeconds = res?.data?.cooldown?.remaining_seconds ?? 0;

        await sleep(cooldownSeconds * 1000)

        const gudgeonCount = character.inventory.reduce((total, item) => {
            return item.code === config.item ? total + item.quantity : total;
        }, 0);

        const inventoryCount = getInventoryCount(character);

        if (inventoryCount.count >= 90) {
            await dumpItems(gudgeonCount);
        }

        if (cooldownSeconds > 0) {
            await sleep(cooldownSeconds * 1000);
        }
    } catch (e) {
        if (e instanceof ArtifactsError) {
            logger({
                level: "error",
                msg: "ArtifactsError",
                meta: {
                    error: e.message,
                    code: e.code,
                    status: e.status
                }
            })
        } else {
            logger({
                level: "error",
                msg: "Unexpected error",
                meta: {
                    error: e.message
                }
            })
        }

        await sleep(5000);
    }
}
