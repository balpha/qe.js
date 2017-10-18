tsc --project "../src"
echo (function(){ > ../dist/qe.js
echo "use strict"; >> ../dist/qe.js
sed -b "s/^/    /"  _qe.js  >> ../dist/qe.js
echo })(); >> ../dist/qe.js
rm _qe.js