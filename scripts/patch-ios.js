// Patch Info.plist with HealthKit permissions and app metadata
// Run after: npx cap add ios
const fs = require('fs');
const path = require('path');

const plistPath = path.join(__dirname, '../ios/App/App/Info.plist');

if (!fs.existsSync(plistPath)) {
  console.error('Info.plist not found at', plistPath);
  console.error('Run: npx cap add ios first');
  process.exit(1);
}

let plist = fs.readFileSync(plistPath, 'utf8');

// Insert before </dict></plist>
const healthKitEntries = `
\t<!-- HealthKit permissions -->
\t<key>NSHealthShareUsageDescription</key>
\t<string>Fitness AI citește pașii, caloriile și ritmul cardiac pentru a urmări activitatea ta și a-ți oferi recomandări personalizate.</string>
\t<key>NSHealthUpdateUsageDescription</key>
\t<string>Fitness AI poate salva antrenamente și activitate în Apple Health.</string>

\t<!-- Camera (pentru foto progres) -->
\t<key>NSCameraUsageDescription</key>
\t<string>Fitness AI folosește camera pentru a face poze de progres.</string>
\t<key>NSPhotoLibraryUsageDescription</key>
\t<string>Fitness AI accesează galeria pentru a selecta poze de progres.</string>
\t<key>NSPhotoLibraryAddUsageDescription</key>
\t<string>Fitness AI salvează pozele de progres în galerie.</string>

\t<!-- Background refresh -->
\t<key>UIBackgroundModes</key>
\t<array>
\t\t<string>fetch</string>
\t\t<string>processing</string>
\t</array>

\t<!-- App metadata -->
\t<key>ITSAppUsesNonExemptEncryption</key>
\t<false/>
`;

if (!plist.includes('NSHealthShareUsageDescription')) {
  plist = plist.replace('</dict>\n</plist>', healthKitEntries + '</dict>\n</plist>');
  fs.writeFileSync(plistPath, plist, 'utf8');
  console.log('✓ Info.plist patched with HealthKit permissions');
} else {
  console.log('Info.plist already has HealthKit permissions, skipping');
}

// Patch Podfile to add HealthKit capability
const podfilePath = path.join(__dirname, '../ios/App/Podfile');
if (fs.existsSync(podfilePath)) {
  let podfile = fs.readFileSync(podfilePath, 'utf8');
  if (!podfile.includes('HealthKit')) {
    // Add after target 'App' do
    podfile = podfile.replace(
      /target 'App' do\n/,
      "target 'App' do\n  # HealthKit\n  pod 'perfood-capacitor-healthkit', :path => '../../node_modules/@perfood/capacitor-healthkit'\n"
    );
    // Alternative: add health capability via entitlements
    fs.writeFileSync(podfilePath, podfile, 'utf8');
    console.log('✓ Podfile patched');
  }
}

// Create App.entitlements if missing
const entitlementsPath = path.join(__dirname, '../ios/App/App/App.entitlements');
if (!fs.existsSync(entitlementsPath)) {
  const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>com.apple.developer.healthkit</key>
\t<true/>
\t<key>com.apple.developer.healthkit.access</key>
\t<array>
\t\t<string>health-records</string>
\t</array>
\t<key>com.apple.security.application-groups</key>
\t<array>
\t\t<string>group.ro.bogdan.fitnessai</string>
\t</array>
</dict>
</plist>
`;
  // Ensure directory exists
  const dir = path.dirname(entitlementsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(entitlementsPath, entitlements, 'utf8');
  console.log('✓ App.entitlements created with HealthKit capability');
}

console.log('\nDone. Run: cd ios/App && pod install');
