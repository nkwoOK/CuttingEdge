//네트워크 기본 설정
const port=8081
const dbAddress = "mongodb+srv://admin:immersion@cluster0-7lhcw.mongodb.net/test?retryWrites=true&w=majority"
const cryptoIterationCount = 100
const jwtSecret = 'secret'
const md5Salt = 'secret'

//일반 모듈 로딩
const logger = require('./config/winston')
const md5 = require('md5')
const crypto = require('crypto')

//네트워크 관련 모듈 로딩
const http = require('http')
const socketio = require('socket.io')
const jwt = require('jsonwebtoken')
const server = http.createServer(function(req,res){}).listen(port,function() {
    logger.info('Server is now running at the port ' + port)
})
const io = socketio.listen(server)

//몽고DB 연결
const mongoose = require('mongoose')
mongoose.connect(dbAddress)
const db = mongoose.connection
db.on('error',function() {
    logger.info('Connection to DB Failed')
})
db.on('open',function() {
    logger.info('Connected to mongoDB')
})

//몽고DB 스키마 작성
const userSchema = mongoose.Schema({
    id:'String',
    password:'String',
    fbToken: 'String',
    jsonWebToken: 'String',
    name:'String',
    school:'String',
    email:'String',
    gender:'String',
    phone:'String',
})
const algorithmDataSchema = mongoose.Schema({
    id:'String',
    departureDateFrom:'String',
    departureDateTo:'String',
    departureLocation:'String',
    destincationLocation:'String',
})
const userModel = mongoose.model('user',userSchema);
const algorithmDataModel = mongoose.model('algorithmData', algorithmDataSchema)

//소켓에서 정보 가져오며 정보 처리
io.sockets.on('connection', function(socket) {
    logger.info('Socket ID: ' + socket.id + ' Connected')
    //클라이언트가 로그인에 접속할 경우
    socket.on('client_login', function(data) {
        logger.info('[client_login]'+data)
        let localId = data.id;
        console.log(data.password);
        let localPassword = (data.password + md5Salt);

        let findConditionLocalUser = {
            id: localId,
            password: localPassword
        }

        userModel.findOne(findConditionLocalUser).exec(function(err, user){
            if(err) {
                socket.emit('server_result',{type:'error', data:'error occured'})
                logger.info('[error]' + 'DB Not found')
            } else if(!user) {
                socket.emit('server_result',{type:'failed', data:'Incorrect id/password'})
                logger.info('[failed]Incorrect id/password')
            } else if(user) {
                socket.emit('server_result',{type:'success', data:user, token:user.jsonWebToken})
                logger.info('[success]' + user.jsonWebToken)
            }
        })
    })

    socket.on('client_login_facebook', function(data) {
        logger.info('[client_login_facebook]' + data);
        let fbUserId = data.id;
        let fbAccessToken = data.fbToken;

        let findConditionFbUserId = {
            id: fbUserId
        }
        userModel.findOne(findConditionLocalUser).exec(function(err, user) {
            if(err) {
                socket.emit('server_result',{type:'error', data:'error occured'})
            } else if(!user) {
                fbSignup(fbUserId, fbAccessToken, function(err, savedUser) {
                    if(err) {
                        socket.emit('server_result',{type:'error', data:'error occured'})
                    } else {
                        socket.emit('server_result',{type:'success', data:savedUser, token:savedUser.token})
                        logger.info('[success]' + savedUser)
                    }
                })
            } else if(user) {
                user.fbToken = fbAccessToken;
                user.save(function(err, savedUser) {
                    socket.emit('server_result',{type:'success', data:user, token: user.jsonWebToken})
                    logger.info('[success]' + user)
                })
            }
        })
    })

    socket.on('client_signup', function(data) {
        logger.info('[client_signup]'+data)
        let localId = data.id;
        let localPassword = (data.password + md5Salt);

        let findConditionLocalUser = {
            id: localId
        }

        userModel.findOne(findConditionLocalUser).exec(function(err, user) {
            if(err) {
                socket.emit('server_result',{type:'error', data:'error occured'})
                logger.info('[error]' + err);
            } else if(user) {
                socket.emit('server_result',{type:'dupulicated', data:'id already exists'})
                logger.info('[failed]' + 'dupulicated id')
            } else if(!user) {
                localSignup(localId, localPassword, function(err, savedUser) {
                    if(err) {
                        socket.emit('server_result',{type:'error', data:'error occured'})
                        logger.info('[error]' + err);
                    } else {
                        socket.emit('server_result',{type:'success', data:savedUser, token:savedUser.jsonWebToken})
                        logger.info('[successs]' + savedUser);
                    }
                })
            }
        })
    })

    function localSignup(id, password, next) {
        let mUserModel = new userModel()
        mUserModel.id = id
        mUserModel.password = password;
        logger.info(userModel)
        mUserModel.save(function(err, newUser) {
            newUser.jsonWebToken = jwt.sign(newUser.id, jwtSecret)
            newUser.save(function(err, savedUser) {
                next(err, savedUser)
            })
        })
    }

    function fbSignup(fbUserId, fbAccessToken , next) {
        let mUserModel = new userModel()
        mUserModel.id = fbUserId
        userModel.fbToken = fbAccessToken
        userModel.save(function(err, newUser) {
            newUser.jsonWebToken = jwt.sign(newUser.id, jwtSecret)
            newUser.save(function(err, savedUser) {
                next(err, savedUser)
            })
        })
    }

    //만약 유저를 특정해야 하는 일이라면 다음과 같이 실행한다.
    socket.on('client_logout', function(data){
            sessionCallback(data, function(user) {
            logger.info('[client_logout]')
            user.jsonWebToken = ""
            user.save()
            socket.disconnect();
        })
    })

    socket.on('client_change_userdata', function(data) {
            sessionCallback(data, function(user) {
            logger.info('[client_change_userdata]'+data)
            user.name = data.name;
            user.school = data.school;
            user.email = data.email;
            user.gender = data.gender;
            user.phone = data.phone;
            user.save(function(err, user) {
                if(err) {
                    socket.emit('server_result', {type:'error'})
                    logger.info('[error]' + err);
                } else {
                    socket.emit("server_result", {type:'success'})
                    logger.info('[successs]')
                }
            })
        })
    })

    socket.on('client_')

    function sessionCallback(data, next) {
        let findConditionToken = {
            jsonWebToken: data.token
        }
        userModel.findOne(findConditionToken, function(err, user) {
            if(err) {
                socket.emit('server_result',{type:'error', data:'error occured'})
                logger.info('[error]' + err)
            } else if(!user) {
                socket.emit('server_result',{type:'failed',data:'token not founded'})
                logger.info('[failed]' + 'token not founded')
            }
            else if(user) {
                socket.emit('server_result',{type:'success', data:user})
                logger.info('[success]' + user)
                next(user);
            }
        })
    }

    //먄약 유저를 특정하지 않으면 다음과 같이 실행한다.
    socket.on('client_disconnect', function(data) {
        socket.disconnect();
    })

    socket.on('client_get_algorithmdata', function(data) {
        algorithmDataModel.find({}, function(err, result) {
            if(err) {
                socket.emit('server_result', {type:'error'});
            } else {
                socket.emit('server_result', {type:'success',data:result});
            }
        })
    })
})





