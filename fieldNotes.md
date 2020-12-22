# socket.io.server

## Field Notes

When clients refresh, an unmarked socket gets sent to the Server, and the Server closes the transport on that socket so it doesn't corrupt processing downstream. Firefox does not behave the way Chrome does. Chrome will automatically send a valid socket connection to the server, but Firefox does nothing (the Firefox user must select the Visitor name in the UI to see a valid connection).

### Chrome

Here's what the Server does with Chrome:
``
[17:29:43] EVENT: disconnect: _Vlg7OntLl3XRh57AAAA/Corning disconnected. Reason:
       transport close

[17:29:43] Handling a connection to Fz2aBm7IWM0puvThAAAF
Unknown socket.

[17:29:44] Handling a connection to _Vlg7OntLl3XRh57AAAA
EVENT: onConnection [Corning / _Vlg7OntLl3XRh57AAAA] Open
``

### Firefox

And here's what the Server does with Firefox refresh:

``
[17:30:56] EVENT: disconnect: mDO3mjNrq_Re2pFWAAAA/fox8081 disconnected. Reason:
       transport close

[17:30:56] Handling a connection to yKaOgy9KY5QBLd_yAAAG
Unknown socket.
``
The refresh first closes the connection on socket ID _Vlg7OntLl3XRh57AAAA. The client then sends a blank socket request (ID yKaOgy9KY5QBLd_yAAAG). since the Server does not see an id field in the socket's query, it ignores this bogus connection permanently disconnecting it.


After the user selects their name again, the Server add this:

``
[17:32:10] Handling a connection to mDO3mjNrq_Re2pFWAAAA
EVENT: onConnection [fox8081 / mDO3mjNrq_Re2pFWAAAA] Open
``

Note this socket ID uses the value generated by the client when the user added the Visitor to local storage: mDO3mjNrq_Re2pFWAAAA.


### Occupancy = 1

Rooms before Study closing...
server.js:215
[
   {
      "id": "w0W4ONHGFCFG-l2XAAAA",
      "room": "Study",
      "namespace": "",
      "connected": true,
      "occupiedRooms": {
         "w0W4ONHGFCFG-l2XAAAA": "w0W4ONHGFCFG-l2XAAAA",
         "Study": "Study"
      }
   }
]
server.js:216
Occupants of Room before closing...
server.js:218
{
   "sockets": {
      "w0W4ONHGFCFG-l2XAAAA": true
   },
   "length": 1
}
server.js:219
...and after Room closing:
server.js:223
undefined
server.js:224
...after Study closing
server.js:226
[]
server.js:227

### Occupancy >1

Rooms before Study closing...
server.js:215
[
   {
      "id": "w0W4ONHGFCFG-l2XAAAA",
      "room": "Study",
      "namespace": "",
      "connected": true,
      "occupiedRooms": {
         "w0W4ONHGFCFG-l2XAAAA": "w0W4ONHGFCFG-l2XAAAA",
         "Study": "Study"
      }
   }
]
server.js:216
Occupants of Room before closing...
server.js:218
{
   "sockets": {
      "w0W4ONHGFCFG-l2XAAAA": true,
      "_Vlg7OntLl3XRh57AAAA": true
   },
   "length": 2
}
server.js:219
...and after Room closing:
server.js:223
{
   "sockets": {
      "_Vlg7OntLl3XRh57AAAA": true
   },
   "length": 1
}
server.js:224
...after Study closing
server.js:226
[
   {
      "id": "w0W4ONHGFCFG-l2XAAAA",
      "room": "Study",
      "namespace": "",
      "connected": true,
      "occupiedRooms": {
         "w0W4ONHGFCFG-l2XAAAA": "w0W4ONHGFCFG-l2XAAAA",
         "Study": "Study"
      }
   }
]
