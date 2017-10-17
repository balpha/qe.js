tsc --project "../src"
echo '(function(){' > ../dist/qe.js
echo '"use strict";' >> ../dist/qe.js
cat _qe.js | sed 's/^/    /' >> ../dist/qe.js
echo '})();' >> ../dist/qe.js
rm _qe.js