/**
 * Utility methods for Zen Coding actions
 * @param {Function} require
 * @param {Underscore} _
 * @author Sergey Chikuyonok (serge.che@gmail.com) <http://chikuyonok.ru>
 */
zen_coding.define('actionUtils', function(require, _) {
	return {
		mimeTypes: {
			'gif' : 'image/gif',
			'png' : 'image/png',
			'jpg' : 'image/jpeg',
			'jpeg': 'image/jpeg',
			'svg' : 'image/svg+xml',
			'html': 'text/html',
			'htm' : 'text/html'
		},
		
		/**
		 * Extracts abbreviations from text stream, starting from the end
		 * @param {String} str
		 * @return {String} Abbreviation or empty string
		 * @memberOf zen_coding.actionUtils
		 */
		extractAbbreviation: function(str) {
			var curOffset = str.length;
			var startIndex = -1;
			var groupCount = 0;
			var braceCount = 0;
			var textCount = 0;
			
			var utils = require('utils');
			
			while (true) {
				curOffset--;
				if (curOffset < 0) {
					// moved to the beginning of the line
					startIndex = 0;
					break;
				}
				
				var ch = str.charAt(curOffset);
				
				if (ch == ']') {
					braceCount++;
				} else if (ch == '[') {
					if (!braceCount) { // unexpected brace
						startIndex = curOffset + 1;
						break;
					}
					braceCount--;
				} else if (ch == '}') {
					textCount++;
				} else if (ch == '{') {
					if (!textCount) { // unexpected brace
						startIndex = curOffset + 1;
						break;
					}
					textCount--;
				} else if (ch == ')') {
					groupCount++;
				} else if (ch == '(') {
					if (!groupCount) { // unexpected brace
						startIndex = curOffset + 1;
						break;
					}
					groupCount--;
				} else {
					if (braceCount || textCount) 
						// respect all characters inside attribute sets or text nodes
						continue;
					else if (!utils.isAllowedChar(ch) || (ch == '>' && utils.endsWithTag(str.substring(0, curOffset + 1)))) {
						// found stop symbol
						startIndex = curOffset + 1;
						break;
					}
				}
			}
			
			if (startIndex != -1 && !textCount && !braceCount && !groupCount) 
				// found something, return abbreviation
				return str.substring(startIndex);
			else
				return '';
		},
		
		/**
		 * Gets image size from image byte stream.
		 * @author http://romeda.org/rePublish/
		 * @param {String} stream Image byte stream (use <code>zen_file.read()</code>)
		 * @return {Object} Object with <code>width</code> and <code>height</code> properties
		 */
		getImageSize: function(stream) {
			var pngMagicNum = "\211PNG\r\n\032\n",
				jpgMagicNum = "\377\330",
				gifMagicNum = "GIF8",
				nextByte = function() {
					return stream.charCodeAt(pos++);
				};
		
			if (stream.substr(0, 8) === pngMagicNum) {
				// PNG. Easy peasy.
				var pos = stream.indexOf('IHDR') + 4;
			
				return { width:  (nextByte() << 24) | (nextByte() << 16) |
								 (nextByte() <<  8) | nextByte(),
						 height: (nextByte() << 24) | (nextByte() << 16) |
								 (nextByte() <<  8) | nextByte() };
			
			} else if (stream.substr(0, 4) === gifMagicNum) {
				pos = 6;
			
				return {
					width:  nextByte() | (nextByte() << 8),
					height: nextByte() | (nextByte() << 8)
				};
			
			} else if (stream.substr(0, 2) === jpgMagicNum) {
				pos = 2;
			
				var l = stream.length;
				while (pos < l) {
					if (nextByte() != 0xFF) return;
				
					var marker = nextByte();
					if (marker == 0xDA) break;
				
					var size = (nextByte() << 8) | nextByte();
				
					if (marker >= 0xC0 && marker <= 0xCF && !(marker & 0x4) && !(marker & 0x8)) {
						pos += 1;
						return { height:  (nextByte() << 8) | nextByte(),
								 width: (nextByte() << 8) | nextByte() };
				
					} else {
						pos += size - 2;
					}
				}
			}
		},
		
		/**
		 * Captures context XHTML element from editor under current caret position.
		 * This node can be used as a helper for abbreviation extraction
		 * @param {IZenEditor} editor
		 * @returns {TreeNode}
		 */
		captureContext: function(editor) {
			var allowedSyntaxes = {'html': 1, 'xml': 1, 'xsl': 1};
			var syntax = String(editor.getSyntax());
			if (syntax in allowedSyntaxes) {
				var tags = require('html_matcher').getTags(
						String(editor.getContent()), 
						editor.getCaretPos(), 
						String(editor.getProfileName()));
				
				if (tags && tags[0] && tags[0].type == 'tag') {
					var reAttr = /([\w\-:]+)(?:\s*=\s*(?:(?:"((?:\\.|[^"])*)")|(?:'((?:\\.|[^'])*)')|([^>\s]+)))?/g;
					var startTag = tags[0];
					var tagAttrs = startTag.full_tag.replace(/^<[\w\-\:]+/, '');
					/** @type TreeNode */
					var contextNode = new require('parser').TreeNode();
					contextNode.name = startTag.name;
					
					// parse attributes
					var m;
					while (m = reAttr.exec(tagAttrs)) {
						contextNode.attributes.push({
							name: m[1],
							value: m[2]
						});
					}
					
					return contextNode;
				}
			}
			
			return null;
		},
		
		/**
		 * Returns line bounds for specific character position
		 * @param {String} text
		 * @param {Number} from Where to start searching
		 * @return {Object}
		 */
		getLineBounds: function(text, from) {
			var len = text.length,
				start = 0,
				end = len - 1;
			
			// search left
			for (var i = from - 1; i > 0; i--) {
				var ch = text.charAt(i);
				if (ch == '\n' || ch == '\r') {
					start = i + 1;
					break;
				}
			}
			// search right
			for (var j = from; j < len; j++) {
				var ch = text.charAt(j);
				if (ch == '\n' || ch == '\r') {
					end = j;
					break;
				}
			}
			
			return {start: start, end: end};
		},
		
		/**
		 * Find expression bounds in current editor at caret position. 
		 * On each character a <code>fn</code> function will be caller which must 
		 * return <code>true</code> if current character meets requirements, 
		 * <code>false</code> otherwise
		 * @param {zen_editor} editor
		 * @param {Function} fn Function to test each character of expression
		 * @return {Array} If expression found, returns array with start and end 
		 * positions 
		 */
		findExpressionBounds: function(editor, fn) {
			var content = String(editor.getContent());
			var il = content.length;
			var exprStart = editor.getCaretPos() - 1;
			var exprEnd = exprStart + 1;
				
			// start by searching left
			while (exprStart >= 0 && fn(content.charAt(exprStart), exprStart, content)) exprStart--;
			
			// then search right
			while (exprEnd < il && fn(content.charAt(exprEnd), exprEnd, content)) exprEnd++;
			
			return exprEnd > exprStart ? [++exprStart, exprEnd] : null;
		},
		
		/**
		 * Make decimal number look good: convert it to fixed precision end remove
		 * trailing zeroes 
		 * @param {Number} num
		 * @param {Number} fraction Fraction numbers (default is 2)
		 * @return {String}
		 */
		prettifyNumber: function(num, fraction) {
			return num.toFixed(typeof fraction == 'undefined' ? 2 : fraction).replace(/\.?0+$/, '');
		},
		
		/**
		 * @param {IZenEditor} editor
		 * @param {Object} data
		 * @returns {Boolean}
		 */
		compoundUpdate: function(editor, data) {
			if (data) {
				var sel = editor.getSelectionRange();
				editor.replaceContent(data.data, data.start, data.end, true);
				editor.createSelection(data.caret, data.caret + sel.end - sel.start);
				return true;
			}
			
			return false;
		},
		
		/**
		 * Replaces or adds attribute to the tag
		 * @param {String} tag
		 * @param {String} attr_name
		 * @param {String} attr_value
		 */
		replaceOrAppendHTMLAttribute: function(tag, attrName, attrValue) {
			if (tag.toLowerCase().indexOf(attrName) != -1) {
				// attribute exists
				var re = new RegExp(attrName + '=([\'"])(.*?)([\'"])', 'i');
				return tag.replace(re, function(str, p1, p2){
					return attrName + '=' + p1 + attrValue + p1;
				});
			} else {
				return tag.replace(/\s*(\/?>)$/, ' ' + attrName + '="' + attrValue + '" $1');
			}
		}
	};
});