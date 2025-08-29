// Test script for ATC classification
async function testATCAPI() {
  console.log('=== Testing ATC Classification ===');
  
  // Test with aspirin ingredient RxCUI directly
  const aspirinRxcui = '1191'; // From previous test
  console.log(`\nTesting aspirin ingredient RxCUI: ${aspirinRxcui}`);
  
  try {
    // Get ATC properties for aspirin ingredient
    const atcUrl = `https://rxnav.nlm.nih.gov/REST/rxcui/${aspirinRxcui}/property.json?propName=ATC`;
    console.log(`ATC URL: ${atcUrl}`);
    
    const atcResponse = await fetch(atcUrl);
    const atcData = await atcResponse.json();
    
    console.log('ATC classification for aspirin ingredient:');
    console.log(JSON.stringify(atcData, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run test
testATCAPI();