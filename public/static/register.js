var validateEmail = function (email) {
    var uni = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
    return uni.test(email);
}

var ok = {
    email: false,
    password: false,
    username: false
}

function testEmail() {
    ok.email = false;
    ChangeButton();
    $('td#email').html('<img class="testIcon" src="../static/loading.gif" />');
    setTimeout(function () {
        var valid = validateEmail($('input#email').val());
        if (valid) {
            var data = {
                email: $('input#email').val()
            }
            $.ajax({
                type: "POST",
                url: "/taken",
                data: data,
                success: TakenResult,
                dataType: "json"
            });
        } else {
            $('td#email img').attr("src", "../static/cross.png");
        }
        ChangeButton();
    }, 500);
}

function testUsername() {
    ok.username = false;
    ChangeButton();
    $('td#username').html(' <img class="testIcon" src="../static/loading.gif" />');
    setTimeout(function () {
        var data = {
            username: $('input#username').val()
        }
        $.ajax({
            type: "POST",
            url: "/taken",
            data: data,
            success: TakenResult,
            dataType: "json"
        });
        ChangeButton();
    }, 500);
}

function testPassword() {
    ok.password = false;
    ChangeButton();
    $('td#password').html(' <img class="testIcon" src="../static/loading.gif" />');
    $('td#verifyPassword').html(' <img class="testIcon" src="../static/loading.gif" />');
    setTimeout(function () {
        var valid = $('input#password').val() == $('input#verifyPassword').val();
        if (valid) {
            $('td#password img').attr("src", "../static/check.png");
            $('td#verifyPassword img').attr("src", "../static/check.png");
            ok.password = true;
        } else {
            $('td#password img').attr("src", "../static/cross.png");
            $('td#verifyPassword img').attr("src", "../static/cross.png");
        }
        ChangeButton();
    }, 500);
}

function Register() {
    ChangeButton();
    if (ok.email && ok.password && ok.username) {
        $('span.failed').text('');
        $('span.succeed').text('');
        var data = {
            username: $('input#username').val(),
            password: $('input#password').val(),
            verifyPassword: $('input#verifyPassword').val(),
            email: $('input#email').val(),
            recaptcha: $('textarea#g-recaptcha-response').val()
        }
        $.ajax({
            type: "POST",
            url: "/register",
            data: data,
            success: RegisterResult,
            dataType: "json"
        });
    }
}

function TakenResult(data) {
    if (data.error) {
        $('span.failed').text(data.error);
    } else {
        if (data.type == "email") {
            if (!data.available) {
                $('td#email img').attr("src", "../static/cross.png");
                ok.email = false;
            } else {
                $('td#email img').attr("src", "../static/check.png");
                ok.email = true;
            }
        } else {
            if(!data.available) {
                $('td#username img').attr("src", "../static/cross.png");
                ok.username = false;
            } else {
                $('td#username img').attr("src", "../static/check.png");
                ok.username = true;
            }
        }
    }
    ChangeButton();
}

function ChangeButton() {
    if (ok.email && ok.password && ok.username) {
        $('button#submit').removeAttr('disabled');
    } else {
        $('button#submit').attr('disabled', 'true');
    }
}

function RegisterResult(data) {
    if (data.error) {
        $('span.failed').text(data.error);
    } else {
        $('tr.reg').each(function () {
            $(this).remove();
        });
        $('span.failed').text('');
        $('span.succeed').text("Welcome to WarriARs, " + data.username);
    }
}

var timeout, last;
function hasChanged(val, cb) {
    var now = val;
    if(last === now)
        return;
    last = now;
    clearTimeout(timeout);
    timeout = setTimeout(function() {
        var newNow = val;
        if(now === newNow) {
            console.log(now, newNow);
            cb;
        }
    }, 1000);
}

$(document).ready(function() {
    $("input#email").on("change keyup paste click", function(){
        hasChanged($("input#email").val(), testEmail());
    });
    $("input#verifyPassword").on("change keyup paste click", function(){
        hasChanged($("input#verifyPassword").val(), testPassword());
    });
    $("input#username").on("change keyup paste click", function(){
        hasChanged($("input#username").val(), testUsername());
    });
});