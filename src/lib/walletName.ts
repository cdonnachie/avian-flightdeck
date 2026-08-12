import { StorageService } from '@/services/core/StorageService';

/**
 * Creative bird-themed wallet-name generator, shared by the onboarding create wizard and (in
 * spirit) WalletCreationForm. Produces names like "Soaring Falcon" or "Kestrel's Treasury" and
 * avoids colliding with wallet names that already exist on the device.
 */

const BIRDS = [
    'Eagle', 'Falcon', 'Hawk', 'Owl', 'Raven', 'Robin', 'Sparrow', 'Phoenix', 'Cardinal', 'Finch',
    'Kestrel', 'Warbler', 'Kingfisher', 'Avian', 'Jay', 'Swift', 'Hummingbird', 'Starling',
    'Nightingale', 'Osprey',
];

const ADJECTIVES = [
    'Soaring', 'Flying', 'Golden', 'Swift', 'Majestic', 'Wise', 'Fierce', 'Crimson', 'Azure',
    'Silver', 'Midnight', 'Emerald', 'Radiant', 'Royal', 'Mystic', 'Celestial', 'Daring', 'Noble',
    'Stellar', 'Vibrant',
];

const EXTRA_ADJECTIVES = [
    'Brave', 'Proud', 'Mighty', 'Serene', 'Wild', 'Nimble', 'Shining', 'Graceful', 'Powerful',
    'Clever', 'Agile', 'Exotic', 'Dazzling', 'Elegant', 'Vigilant', 'Electric', 'Obsidian', 'Amber',
    'Fiery',
];

const FORMATS: Array<(adj: string, bird: string) => string> = [
    (adj, bird) => `${adj} ${bird}`,
    (adj, bird) => `${bird} Nest`,
    (adj, bird) => `Sky ${bird}`,
    (adj, bird) => `${bird} Flight`,
    (adj, bird) => `${adj} Wings`,
    (adj, bird) => `${bird}'s Treasury`,
    (adj, bird) => `${adj} Feathers`,
    (adj, bird) => `${bird} Vault`,
];

function randomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

/** Returns a creative wallet name that does not collide with any wallet already on the device. */
export async function generateWalletName(): Promise<string> {
    let existingNames: string[] = [];
    try {
        const allWallets = await StorageService.getAllWallets();
        existingNames = allWallets.map((wallet) => wallet.name);
    } catch {
        // Continue without the existing-name check if storage is unavailable.
    }

    const make = (adjectivePool: string[]) =>
        randomItem(FORMATS)(randomItem(adjectivePool), randomItem(BIRDS));

    let name = make(ADJECTIVES);
    if (existingNames.includes(name)) {
        name = make([...ADJECTIVES, ...EXTRA_ADJECTIVES]);
        if (existingNames.includes(name)) {
            let counter = 1;
            let withSuffix = `${name} ${counter}`;
            while (existingNames.includes(withSuffix) && counter < 100) {
                counter++;
                withSuffix = `${name} ${counter}`;
            }
            name = withSuffix;
        }
    }
    return name;
}
