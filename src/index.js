import dotenv from "dotenv";
import {ArtifactsApi, ArtifactsError} from "artifacts-api-client";
import {coords} from "./constants.js";

dotenv.config({
    //path: "../.env"
})

console.log("Starting....")
const api = ArtifactsApi.create({
    token: process.env.TOKEN
})

export function sleep(ms) {
    console.log("Waiting for " + ms / 1000 + " seconds.")
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

export async function depositToBank(name, code, quantity) {
    const { data } = await api.myCharacters.move(name, coords.BANK)
    await sleep(data.cooldown.remaining_seconds * 1000)
    console.log(name, code, quantity)
    const res = await api.myCharacters.depositBankItem(name, [{
        code: code,
        quantity: quantity
    }])
    await sleep(res.data.cooldown.remaining_seconds * 1000)
    return getInventoryCount(res.data.character)
}

async function dumpItems(quantity) {
    await depositToBank("olli", "gudgeon", quantity)
    const { data} = await api.myCharacters.move("olli", coords.GUDGEON)
    return await sleep(data.cooldown.remaining_seconds * 1000)
}

let running = true;

while (running) {
    try {
        const res = await api.myCharacters.gathering("olli");
        const character = res?.data?.character;
        const cooldownSeconds = res?.data?.cooldown?.remaining_seconds ?? 0;

        if (!character?.inventory) {
            console.error("Missing character inventory in gathering response");
            await sleep(5000);
            continue;
        }

        const gudgeonCount = character.inventory.reduce((total, item) => {
            return item.code === "gudgeon" ? total + item.quantity : total;
        }, 0);

        const inventoryCount = getInventoryCount(character);

        if (inventoryCount.count >= 100) {
            await dumpItems(gudgeonCount);
        }

        if (cooldownSeconds > 0) {
            await sleep(cooldownSeconds * 1000);
        }
    } catch (e) {
        if (e instanceof ArtifactsError) {
            console.error("ArtifactsError:", e.message);
        } else {
            console.error("Unexpected error:", e);
        }

        await sleep(5000);
    }
}