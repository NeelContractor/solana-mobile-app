# Solana Mobile Expo App

## Step to run

- clone locally
```bash
git clone <repo_url>
```

- install dependencies
```bash
yarn install
```

- run locally (with connecting you android mobile with usb)
```
npx expo run:android
```

## start mint-server
- mint server
```bash
node mint-server.js
```

- paste the address to EXPO_PUBLIC_MINT_SERVER_URL in .env
- keep it running while running the application