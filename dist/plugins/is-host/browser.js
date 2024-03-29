"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function isHostObject(object) {
    var str = Object.prototype.toString.call(object);
    switch (str) {
        case '[object File]':
        case '[object Blob]':
        case '[object FormData]':
        case '[object ArrayBuffer]':
            return true;
        default:
            return false;
    }
}
exports.default = isHostObject;
//# sourceMappingURL=browser.js.map