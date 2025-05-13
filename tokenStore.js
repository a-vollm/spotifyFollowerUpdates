const fs = require('fs');
const path = require('path');

const file = process.env.TOKEN_FILE || path.resolve(__dirname, 'tokens.json');

function read() {
    try {
        const raw = fs.readFileSync(file, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function write(data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

exports.get = (userId) => {
    const all = read();
    return all[userId] || null;
};

exports.set = (userId, tokenData) => {
    const all = read();
    all[userId] = tokenData;
    write(all);
};

exports.delete = (userId) => {
    const all = read();
    delete all[userId];
    write(all);
};

exports.all = () => read();
