///<reference path="dom.ts"/>

function parseAndRegister(s: string) {
    var definitions = parse(s);
    for (let def of definitions) {
        QE.register(def.name, def.component)
    }
}

function parse(s: string): { name: string, component: IComponent}[] {
    var result = [];
    var cre = /([\w-]+)\(\)\s*\{/g;
    var dre = /\}|([\w.$-]+|\[[\w-]+\])\s*:\s*([^;]*);/g; // FIXME
    var cmatch;
    while (cmatch = cre.exec(s)) {
        let dmatch;
        let def = {
            name: cmatch[1],
            component: {
                tunnels: [] as string[],
                attributes: Object.create(null) as { [a: string]: string }
            }
        };
        result.push(def);
        dre.lastIndex = cre.lastIndex;
        while ((dmatch = dre.exec(s)) && dmatch[0] !== "}") {
            let prop = dmatch[1];
            if (prop[0] === "[") {
                def.component.attributes[prop.substr(1, prop.length - 2)] = dmatch[2];
            } else {
                var split = dmatch[2].split(" if ");
                if (split.length > 1) {
                    def.component.tunnels.push(split[0] + " into " + prop + " if " + split[1]);
                } else {
                    def.component.tunnels.push(split[0] + " into " + prop);
                }
            }
        }
        cre.lastIndex = dre.lastIndex;
    }
    return result;
}

QE.parseAndRegister = parseAndRegister;