require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CapgoOAuthLoopback'
  s.version = package['version']
  s.summary = 'Loopback OAuth callback listener for Capgo Browser'
  s.license = 'MIT'
  s.homepage = 'https://github.com/Cap-go/capgo-browser'
  s.author = 'Capgo'
  s.source = { :git => 'https://github.com/Cap-go/capgo-browser.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
