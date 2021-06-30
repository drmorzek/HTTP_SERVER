const net = require('net')

const STATUS_CODES = {
    '100': 'Continue',
    '101': 'Switching Protocols',
    '102': 'Processing',
    '103': 'Early Hints',
    '200': 'OK',
    '201': 'Created',
    '202': 'Accepted',
    '203': 'Non-Authoritative Information',
    '204': 'No Content',
    '205': 'Reset Content',
    '206': 'Partial Content',
    '207': 'Multi-Status',
    '208': 'Already Reported',
    '226': 'IM Used',
    '300': 'Multiple Choices',
    '301': 'Moved Permanently',
    '302': 'Found',
    '303': 'See Other',
    '304': 'Not Modified',
    '305': 'Use Proxy',
    '307': 'Temporary Redirect',
    '308': 'Permanent Redirect',
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '402': 'Payment Required',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '406': 'Not Acceptable',
    '407': 'Proxy Authentication Required',
    '408': 'Request Timeout',
    '409': 'Conflict',
    '410': 'Gone',
    '411': 'Length Required',
    '412': 'Precondition Failed',
    '413': 'Payload Too Large',
    '414': 'URI Too Long',
    '415': 'Unsupported Media Type',
    '416': 'Range Not Satisfiable',
    '417': 'Expectation Failed',
    '418': "I'm a Teapot",
    '421': 'Misdirected Request',
    '422': 'Unprocessable Entity',
    '423': 'Locked',
    '424': 'Failed Dependency',
    '425': 'Too Early',
    '426': 'Upgrade Required',
    '428': 'Precondition Required',
    '429': 'Too Many Requests',
    '431': 'Request Header Fields Too Large',
    '451': 'Unavailable For Legal Reasons',
    '500': 'Internal Server Error',
    '501': 'Not Implemented',
    '502': 'Bad Gateway',
    '503': 'Service Unavailable',
    '504': 'Gateway Timeout',
    '505': 'HTTP Version Not Supported',
    '506': 'Variant Also Negotiates',
    '507': 'Insufficient Storage',
    '508': 'Loop Detected',
    '509': 'Bandwidth Limit Exceeded',
    '510': 'Not Extended',
    '511': 'Network Authentication Required'
  }

class Response {

	constructor(socket) {
		this.socket = socket
		this.status = 200
		this.headersSent = false
		this.isChunked = false
		this.headers = {}
	}

	setStatus(status) {
		this.status = status
	}

	setHeader(key, value) {
		this.headers[key] = value
	}

	writeHead(statusCode = this.status, headers = {}) {
		if (!this.headersSent) {
			this.headersSent = true
			for (const key in headers) {
				this.setHeader(key, headers[key])
			}
			this.setHeader('Date', new Date().toGMTString())
			if (!this.headers['Content-Length']) {
				this.isChunked = true
				this.setHeader('Transfer-Encoding', 'chunked')
			}
			this.socket.write(`HTTP/1.1 ${statusCode} ${STATUS_CODES[statusCode]}\r\n`)
			for (const key in this.headers) {
				this.socket.write(`${key}: ${this.headers[key]}\r\n`)
			}
			this.socket.write('\r\n')
		}
	}

	write(chunk) {
		if (!this.headersSent) {
			if (!this.headers['Content-Length']) {
				this.isChunked = true
				this.setHeader('Transfer-Encoding', 'chunked')
			}
			this.writeHead()
		}
		if (this.isChunked) {
			const hexSize = chunk.length.toString(16)
			this.socket.write(hexSize + '\r\n')
			this.socket.write(chunk + '\r\n')
		} else {
			this.socket.write(chunk)
		}
	}

	end(chunk) {
		if (!this.headersSent) {
			if (!this.headers['Content-Length']) {
				this.setHeader('Content-Length', chunk ? chunk.length : 0)
			}
			this.writeHead()
		}
		if (this.isChunked) {
			if (chunk) {
				this.write(chunk)
			}
			this.socket.end('0\r\n\r\n')
		} else {
			this.socket.end(chunk)
		}
	}
}

const createRequest = (socket) => {
	let header, buffer = Buffer.from('')
	while (true) {
		const tempBuffer = socket.read()
		if (tempBuffer === null) {
			break
		}
		buffer = Buffer.concat([buffer, tempBuffer])
		const separator = buffer.indexOf('\r\n\r\n')
		if (separator !== -1) {
			const remaining = buffer.slice(separator + 4)
			header = buffer.slice(0, separator).toString()
			socket.unshift(remaining)
			break
		}
	}
	const tempHeaders = header.split('\r\n')
	const startingLine = tempHeaders.shift().split(' ')
	const headers = {}
	for (const header of tempHeaders) {
		const [key, value] = header.split(':')
		headers[key] = value.trim()
	}
	return {
		socket,
		headers,
		method: startingLine[0],
		url: startingLine[1],
		on(...args) {
			socket.on(...args)
		}
	}
}

class Server {

	constructor(requestListener) {
		this.server = net.createServer()
		this.server.on('connection', (socket) => {
			socket.once('readable', () => {
				const request = createRequest(socket)
				const response = new Response(socket)
				requestListener(request, response)
			})
		})
	}

	listen(...args) {
		this.server.listen(...args)
	}

	close() {
		this.server.close()
	}
}

exports.createServer = (requestListener) => new Server(requestListener)